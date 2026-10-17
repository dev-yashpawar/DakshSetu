import type { Express, Request, Response, RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Models } from "./models.js";
import { publicUser, emptyProfile, HttpError } from "./services.js";
import { audit } from "./audit.js";
import { registerSchema } from "../../shared/validation.js";
import { rubric, calculatePractical } from "../../shared/assessment.js";
import { defaultPolicy, type SystemSettings } from "../../shared/management.js";
import type { Assessment } from "../../shared/types.js";
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    void fn(req, res).catch(next);
  };
const uuid = z.string().uuid(),
  reason = z.string().trim().min(10).max(1000);
const pagination = (req: Request) => ({
  page: z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .default(1)
    .parse(req.query.page),
  limit: 25,
});
const policy = z
  .object({
    selfWeight: z.number().min(0).max(1),
    practicalWeight: z.number().min(0).max(1),
    competent: z.number().min(1).max(100),
    minorGap: z.number().min(1).max(99),
    furtherAssessment: z.number().min(0).max(98),
  })
  .strict()
  .refine(
    (v) =>
      Math.abs(v.selfWeight + v.practicalWeight - 1) < 0.00001 &&
      v.competent > v.minorGap &&
      v.minorGap > v.furtherAssessment,
    "Weights must total 100% and thresholds must be descending.",
  );
export async function getSettings(db: Models): Promise<SystemSettings> {
  return (
    (await db.SystemSettings.findOne({ id: "system" }).lean()) ?? {
      id: "system",
      version: 0,
      languages: ["en", "hi", "mr"],
      demoEnabled: true,
      activeQualificationId: "demo-ele-001",
      policy: { ...defaultPolicy },
      updatedAt: "",
    }
  );
}
export function registerManagementRoutes(
  app: Express,
  db: Models,
  auth: RequestHandler,
) {
  app.post(
    "/api/assessments/:id/ai-review",
    auth,
    wrap(async (req, res) => {
      if (req.user.role !== "assessor")
        throw new HttpError(403, "This area is for assessors.");
      const input = z
          .object({
            baseVersion: z.number().int().nonnegative(),
            decision: z.enum(["accepted", "edited", "rejected"]),
            note: z.string().trim().min(10).max(1500),
          })
          .strict()
          .parse(req.body),
        id = uuid.parse(req.params.id),
        a = await db.Assessment.findOne({ id }).lean();
      if (!a) throw new HttpError(404, "Assessment not found.");
      if (a.assessorId !== req.user.id)
        throw new HttpError(403, "This area is for the assigned assessor.");
      if (a.status === "SIGNED_OFF")
        throw new HttpError(423, "This assessment is signed off and locked.");
      if (!a.aiObservation)
        throw new HttpError(409, "Run an AI observation before reviewing it.");
      const at = new Date().toISOString(),
        review = {
          decision: input.decision,
          note: input.note,
          assessorId: req.user.id,
          at,
          analysisCreatedAt: a.aiObservation.createdAt,
        };
      const saved = await db.Assessment.findOneAndUpdate(
        {
          id,
          assessorId: req.user.id,
          version: input.baseVersion,
          status: { $ne: "SIGNED_OFF" },
        },
        {
          $set: { aiReview: review, updatedAt: at },
          $inc: { version: 1 },
          $push: {
            history: {
              action: "AI_OBSERVATION_REVIEWED",
              actorId: req.user.id,
              at,
              reason: input.note,
            },
          },
        },
        { new: true },
      ).lean();
      if (!saved)
        throw new HttpError(409, "Assessment changed. Reload before saving.");
      await audit(db, {
        id: randomUUID(),
        actorId: req.user.id,
        actorRole: "assessor",
        assessmentId: id,
        action: "AI_OBSERVATION_REVIEWED",
        metadata: {
          decision: review.decision,
          note: review.note,
          aiSuggestedScore: a.aiSuggestedScore ?? 0,
        },
      });
      res.json(saved);
    }),
  );
  app.put(
    "/api/workers/account",
    auth,
    wrap(async (req, res) => {
      if (req.user.role !== "worker")
        throw new HttpError(403, "This area is for workers.");
      const input = registerSchema
        .pick({ name: true, phone: true })
        .extend({
          state: z.string().trim().max(80),
          district: z.string().trim().max(80),
        })
        .strict()
        .parse(req.body);
      await db.User.updateOne(
        { id: req.user.id },
        {
          $set: {
            name: input.name,
            phone: input.phone,
            updatedAt: new Date().toISOString(),
          },
        },
      );
      await db.Profile.updateOne(
        { userId: req.user.id },
        { $set: { state: input.state, district: input.district } },
      );
      await audit(db, {
        id: randomUUID(),
        actorId: req.user.id,
        actorRole: "worker",
        action: "WORKER_ACCOUNT_UPDATED",
        metadata: {},
      });
      res.json(
        publicUser((await db.User.findOne({ id: req.user.id }).lean())!),
      );
    }),
  );
  app.get(
    "/api/workers/portal",
    auth,
    wrap(async (req, res) => {
      if (req.user.role !== "worker")
        throw new HttpError(403, "This area is for workers.");
      const a = await db.Assessment.findOne({ workerId: req.user.id })
        .select("-responses")
        .lean();
      const assessor = a?.assessorId
        ? await db.User.findOne({ id: a.assessorId }).select("name").lean()
        : null;
      res.json({
        assessment: a,
        assessorName: assessor?.name ?? "",
        evidence: a
          ? await db.Evidence.find({
              assessmentId: a.id,
              id: { $in: a.evidenceIds },
            })
              .select("id type filename createdAt mimeType")
              .lean()
          : [],
      });
    }),
  );
  const admin: RequestHandler = (req, _res, next) =>
    req.user.role === "admin"
      ? next()
      : next(new HttpError(403, "This area is for administrators."));
  app.use("/api/manage", auth, admin, (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  const log = async (
    req: Request,
    action: string,
    metadata: Record<string, string | number | boolean>,
    assessmentId?: string,
  ) =>
    audit(db, {
      id: randomUUID(),
      actorId: req.user.id,
      actorRole: "admin",
      action,
      metadata,
      assessmentId,
    });
  app.get(
    "/api/settings/public",
    wrap(async (_req, res) => {
      const s = await getSettings(db);
      res.json({ languages: s.languages, demoEnabled: s.demoEnabled });
    }),
  );
  app.get(
    "/api/manage/settings",
    wrap(async (_req, res) => res.json(await getSettings(db))),
  );
  app.put(
    "/api/manage/settings",
    wrap(async (req, res) => {
      const input = z
        .object({
          baseVersion: z.number().int().nonnegative(),
          languages: z
            .array(z.enum(["en", "hi", "mr"]))
            .min(1)
            .max(3),
          demoEnabled: z.boolean(),
          activeQualificationId: z.string().min(1).max(100),
          policy,
          reason,
        })
        .strict()
        .parse(req.body);
      const q = await db.Qualification.findOne({
        id: input.activeQualificationId,
      }).lean();
      if (!q || q.active === false || (q.trade && q.trade !== "Electrician"))
        throw new HttpError(400, "Select an active Electrician qualification.");
      const now = new Date().toISOString();
      await db.SystemSettings.updateOne(
        { id: "system" },
        { $setOnInsert: await getSettings(db) },
        { upsert: true },
      );
      const { baseVersion, reason: why, ...changes } = input;
      const saved = await db.SystemSettings.findOneAndUpdate(
        { id: "system", version: baseVersion },
        {
          $set: {
            ...changes,
            languages: [...new Set(changes.languages)],
            updatedAt: now,
          },
          $inc: { version: 1 },
        },
        { new: true },
      ).lean();
      if (!saved)
        throw new HttpError(409, "Settings changed. Reload before saving.");
      await log(req, "SYSTEM_SETTINGS_CHANGED", {
        reason: why,
        version: saved.version,
      });
      res.json(saved);
    }),
  );
  app.get(
    "/api/manage/users",
    wrap(async (req, res) => {
      const { page, limit } = pagination(req),
        role = z
          .enum(["worker", "assessor", "admin"])
          .optional()
          .parse(req.query.role),
        status = z
          .enum(["ACTIVE", "INACTIVE"])
          .optional()
          .parse(req.query.status),
        search = z.string().trim().max(80).optional().parse(req.query.search);
      const filter: Record<string, unknown> = {
        ...(role ? { role } : {}),
        ...(status === "ACTIVE"
          ? { accountStatus: { $ne: "INACTIVE" } }
          : status
            ? { accountStatus: status }
            : {}),
      };
      if (search)
        filter.$or = [
          {
            name: {
              $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
              $options: "i",
            },
          },
          {
            email: {
              $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
              $options: "i",
            },
          },
        ];
      const [items, total] = await Promise.all([
        db.User.find(filter)
          .sort({ createdAt: -1, id: 1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        db.User.countDocuments(filter),
      ]);
      res.json({ items: items.map(publicUser), page, total });
    }),
  );
  app.post(
    "/api/manage/users",
    wrap(async (req, res) => {
      const input = registerSchema
        .extend({
          password: z
            .string()
            .min(12)
            .max(72)
            .refine((v) => Buffer.byteLength(v) <= 72),
          role: z.enum(["worker", "assessor", "admin"]),
        })
        .strict()
        .parse(req.body);
      const { password, ...fields } = input,
        now = new Date().toISOString(),
        user = {
          ...fields,
          id: randomUUID(),
          accountStatus: "ACTIVE" as const,
          managementVersion: 0,
          passwordHash: await bcrypt.hash(password, 12),
          createdAt: now,
          updatedAt: now,
        };
      await db.User.create(user);
      if (user.role === "worker")
        await db.Profile.create(emptyProfile(user.id));
      await log(req, "USER_CREATED", { userId: user.id, role: user.role });
      res.status(201).json(publicUser(user));
    }),
  );
  app.patch(
    "/api/manage/users/:id",
    wrap(async (req, res) => {
      const leaseToken = randomUUID();
      await db.ManagementLock.updateOne(
        { id: "user-access" },
        { $setOnInsert: { id: "user-access", leaseUntil: new Date(0) } },
        { upsert: true },
      );
      const lease = await db.ManagementLock.findOneAndUpdate(
        { id: "user-access", leaseUntil: { $lte: new Date() } },
        {
          $set: { leaseUntil: new Date(Date.now() + 30000), token: leaseToken },
        },
        { new: true },
      );
      if (!lease)
        throw new HttpError(
          409,
          "Another account change is in progress. Try again.",
        );
      let result: ReturnType<typeof publicUser> | undefined;
      try {
        const input = z
            .object({
              baseVersion: z.number().int().nonnegative(),
              role: z.enum(["worker", "assessor", "admin"]),
              accountStatus: z.enum(["ACTIVE", "INACTIVE"]),
              reason,
            })
            .strict()
            .parse(req.body),
          id = uuid.parse(req.params.id);
        if (id === req.user.id)
          throw new HttpError(
            409,
            "Use another administrator to change your own access.",
          );
        const actor = await db.User.findOne({
          id: req.user.id,
          role: "admin",
          accountStatus: { $ne: "INACTIVE" },
        }).lean();
        if (!actor)
          throw new HttpError(
            403,
            "Administrator access changed. Sign in again.",
          );
        const u = await db.User.findOne({ id }).lean();
        if (!u) throw new HttpError(404, "Account not found.");
        if (
          u.role === "worker" &&
          input.role !== "worker" &&
          (await db.Assessment.exists({ workerId: id }))
        )
          throw new HttpError(
            409,
            "A worker with an assessment must keep the worker role.",
          );
        if (
          u.role === "assessor" &&
          (input.role !== "assessor" || input.accountStatus === "INACTIVE") &&
          (await db.Assessment.exists({
            assessorId: id,
            status: { $ne: "SIGNED_OFF" },
          }))
        )
          throw new HttpError(
            409,
            "Reassign open assessments before changing assessor access.",
          );
        const v = await db.User.findOneAndUpdate(
          {
            id,
            ...(input.baseVersion === 0
              ? {
                  $or: [
                    { managementVersion: 0 },
                    { managementVersion: { $exists: false } },
                  ],
                }
              : { managementVersion: input.baseVersion }),
          },
          {
            $set: {
              role: input.role,
              accountStatus: input.accountStatus,
              updatedAt: new Date().toISOString(),
            },
            $inc: { managementVersion: 1 },
          },
          { new: true },
        ).lean();
        if (!v)
          throw new HttpError(409, "Account changed. Reload before saving.");
        if (v.role === "worker")
          await db.Profile.updateOne(
            { userId: id },
            { $setOnInsert: emptyProfile(id) },
            { upsert: true },
          );
        await log(req, "USER_ACCESS_CHANGED", {
          userId: id,
          previousRole: u.role,
          role: v.role,
          status: v.accountStatus ?? "ACTIVE",
          reason: input.reason,
        });
        result = publicUser(v);
      } finally {
        await db.ManagementLock.updateOne(
          { id: "user-access", token: leaseToken },
          { $set: { leaseUntil: new Date(0) }, $unset: { token: 1 } },
        );
      }
      res.json(result);
    }),
  );
  app.get(
    "/api/manage/assessors",
    wrap(async (_req, res) => {
      const [users, assessments, scores, cases] = await Promise.all([
        db.User.find({ role: "assessor" }).lean(),
        db.Assessment.find().lean(),
        db.CalibrationScore.find({ condition: "calibration" }).lean(),
        db.CalibrationCase.find().lean(),
      ]);
      res.json(
        users.map((u) => {
          const own = assessments.filter((a) => a.assessorId === u.id),
            done = own.filter((a) => a.status === "SIGNED_OFF"),
            cal = scores
              .filter((s) => s.assessorId === u.id)
              .map((s) => {
                const c = cases.find((c) => c.id === s.caseId);
                return c
                  ? {
                      ...s,
                      reference: calculatePractical(
                        c.referenceScores.map((r) => ({ ...r, remark: "" })),
                        2,
                      ),
                      score: calculatePractical(
                        s.scores.map((r) => ({ ...r, remark: "" })),
                        2,
                      ),
                    }
                  : null;
              })
              .filter((x) => x !== null);
          return {
            ...publicUser(u),
            assigned: own.length,
            pending: own.filter((a) => a.status === "SELF_ASSESSED").length,
            inProgress: own.filter((a) => a.status === "IN_ASSESSMENT").length,
            completed: done.length,
            average: done.length
              ? done.reduce((n, a) => n + (a.assessorScore ?? 0), 0) /
                done.length
              : null,
            calibration: cal,
            requiresCalibration: cal.some(
              (c) => Math.abs(c.score - c.reference) >= 10,
            ),
          };
        }),
      );
    }),
  );
  app.get(
    "/api/manage/assessments",
    wrap(async (req, res) => {
      const { page, limit } = pagination(req),
        status = z
          .enum(["SELF_ASSESSED", "IN_ASSESSMENT", "SIGNED_OFF"])
          .optional()
          .parse(req.query.status),
        batch = z.string().max(80).optional().parse(req.query.batch);
      const filter = {
        ...(status ? { status } : {}),
        ...(batch ? { batch } : {}),
      };
      const [items, total, people] = await Promise.all([
        db.Assessment.find(filter)
          .select("-responses -history -aiObservation")
          .sort({ createdAt: -1, id: 1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        db.Assessment.countDocuments(filter),
        db.User.find().select("id name role accountStatus").lean(),
      ]);
      res.json({
        items: items.map((a) => ({
          ...a,
          workerName:
            people.find((u) => u.id === a.workerId)?.name ?? a.workerId,
          assessorName: people.find((u) => u.id === a.assessorId)?.name ?? "",
        })),
        people,
        page,
        total,
      });
    }),
  );
  app.get(
    "/api/manage/assessments/:id",
    wrap(async (req, res) => {
      const a = await db.Assessment.findOne({ id: uuid.parse(req.params.id) })
        .select("-responses")
        .lean();
      if (!a) throw new HttpError(404, "Assessment not found.");
      const [profile, analyses, evidence, events] = await Promise.all([
        db.Profile.findOne({ userId: a.workerId }).lean(),
        db.AIAnalysis.find({ assessmentId: a.id }).lean(),
        db.Evidence.find({ assessmentId: a.id })
          .select("id type filename createdAt")
          .lean(),
        db.AuditLog.find({ assessmentId: a.id })
          .sort({ createdAt: -1 })
          .limit(100)
          .lean(),
      ]);
      res.json({
        assessment: {
          ...a,
          aiHumanDifference:
            a.assessorScore !== undefined && a.aiSuggestedScore !== undefined
              ? a.assessorScore - a.aiSuggestedScore
              : null,
        },
        profile,
        analyses,
        evidence,
        events,
      });
    }),
  );
  app.get(
    "/api/manage/batches",
    wrap(async (_req, res) => {
      const all = await db.Assessment.find({
          batch: { $exists: true, $ne: "" },
        })
          .select("id batch status")
          .lean(),
        batches = new Map<
          string,
          {
            batch: string;
            total: number;
            pending: number;
            inProgress: number;
            completed: number;
          }
        >();
      for (const a of all) {
        const b = batches.get(a.batch!) ?? {
          batch: a.batch!,
          total: 0,
          pending: 0,
          inProgress: 0,
          completed: 0,
        };
        b.total++;
        if (a.status === "SELF_ASSESSED") b.pending++;
        else if (a.status === "IN_ASSESSMENT") b.inProgress++;
        else b.completed++;
        batches.set(b.batch, b);
      }
      res.json({ items: [...batches.values()] });
    }),
  );
  app.post(
    "/api/manage/assessments/:id/assign",
    wrap(async (req, res) => {
      const input = z
          .object({
            baseVersion: z.number().int().nonnegative(),
            assessorId: uuid,
            batch: z.string().trim().max(80).default(""),
            scheduledAt: z
              .union([z.string().datetime(), z.literal("")])
              .default(""),
            reason,
          })
          .strict()
          .parse(req.body),
        id = uuid.parse(req.params.id);
      if (
        !(await db.User.exists({
          id: input.assessorId,
          role: "assessor",
          accountStatus: { $ne: "INACTIVE" },
        }))
      )
        throw new HttpError(400, "Choose an active assessor.");
      const a = await db.Assessment.findOne({ id }).lean();
      if (!a) throw new HttpError(404, "Assessment not found.");
      if (a.status === "SIGNED_OFF")
        throw new HttpError(423, "This assessment is signed off and locked.");
      const now = new Date().toISOString(),
        event = {
          action: "ASSESSMENT_ASSIGNED",
          actorId: req.user.id,
          at: now,
          reason: input.reason,
        };
      const saved = await db.Assessment.findOneAndUpdate(
        { id, version: input.baseVersion, status: { $ne: "SIGNED_OFF" } },
        {
          $set: {
            assessorId: input.assessorId,
            batch: input.batch,
            scheduledAt: input.scheduledAt,
            updatedAt: now,
          },
          $inc: { version: 1 },
          $push: { history: event },
        },
        { new: true },
      ).lean();
      if (!saved)
        throw new HttpError(
          409,
          "Assessment changed. Reload before assigning.",
        );
      await log(
        req,
        "ASSESSMENT_ASSIGNED",
        {
          previousAssessor: a.assessorId ?? "",
          assessorId: input.assessorId,
          batch: input.batch,
          reason: input.reason,
        },
        id,
      );
      res.json(saved);
    }),
  );
  const qSchema = z
    .object({
      title: z.string().trim().min(3).max(150),
      code: z.string().trim().min(3).max(80),
      nsqfLevel: z.number().min(1).max(8),
      sector: z.string().trim().min(2).max(100),
      skills: z.array(z.string().trim().min(2).max(100)).min(1).max(30),
      tasks: z.array(z.string().trim().min(2).max(200)).min(1).max(20),
      nos: z.array(z.string().trim().min(2).max(200)).max(40),
      isDemo: z.literal(true),
      trade: z.literal("Electrician"),
      active: z.boolean(),
      sourceUrl: z
        .union([
          z
            .string()
            .url()
            .refine((s) => s.startsWith("https://")),
          z.literal(""),
        ])
        .default(""),
    })
    .strict();
  app.get(
    "/api/manage/qualifications",
    wrap(async (_req, res) =>
      res.json(await db.Qualification.find().sort({ title: 1 }).lean()),
    ),
  );
  app.post(
    "/api/manage/qualifications",
    wrap(async (req, res) => {
      const input = qSchema.parse(req.body),
        q = { ...input, id: randomUUID(), revision: 0 };
      await db.Qualification.create(q);
      await log(req, "QUALIFICATION_CREATED", {
        qualificationId: q.id,
        code: q.code,
      });
      res.status(201).json(q);
    }),
  );
  app.put(
    "/api/manage/qualifications/:id",
    wrap(async (req, res) => {
      const { baseVersion, ...input } = qSchema
          .extend({ baseVersion: z.number().int().nonnegative() })
          .parse(req.body),
        id = z.string().min(1).max(100).parse(req.params.id),
        old = await db.Qualification.findOne({ id }).lean();
      if (!old) throw new HttpError(404, "Qualification not found.");
      if (!input.active && (await getSettings(db)).activeQualificationId === id)
        throw new HttpError(
          409,
          "Select another active qualification in settings first.",
        );
      const saved = await db.Qualification.findOneAndUpdate(
        {
          id,
          ...(baseVersion === 0
            ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
            : { revision: baseVersion }),
        },
        { $set: input, $inc: { revision: 1 } },
        { new: true },
      ).lean();
      if (!saved)
        throw new HttpError(
          409,
          "Qualification changed. Reload before saving.",
        );
      await log(req, "QUALIFICATION_UPDATED", {
        qualificationId: id,
        revision: saved.revision ?? 0,
      });
      res.json(saved);
    }),
  );
  app.get(
    "/api/manage/qualifications/:id/rubrics",
    wrap(async (req, res) =>
      res.json(
        await db.QualificationRevision.find({ qualificationId: req.params.id })
          .sort({ version: -1 })
          .lean(),
      ),
    ),
  );
  app.post(
    "/api/manage/qualifications/:id/rubrics",
    wrap(async (req, res) => {
      const input = z
        .object({
          taskTitle: z.string().trim().min(10).max(200),
          criteria: z
            .array(
              z
                .object({
                  id: z.enum(rubric.map((r) => r.id) as [string, ...string[]]),
                  criterion: z.string().trim().min(3).max(150),
                  section: z.enum(["Safety", "Procedure", "Testing"]),
                  weight: z.number().positive().max(100),
                  mandatory: z.boolean(),
                })
                .strict(),
            )
            .length(12),
        })
        .strict()
        .parse(req.body);
      if (
        new Set(input.criteria.map((r) => r.id)).size !== 12 ||
        Math.abs(input.criteria.reduce((n, r) => n + r.weight, 0) - 100) >
          0.001 ||
        input.criteria.some(
          (r) =>
            rubric.find((x) => x.id === r.id)!.section !== r.section ||
            (rubric.find((x) => x.id === r.id)!.mandatory && !r.mandatory),
        )
      )
        throw new HttpError(
          400,
          "Keep all twelve criterion IDs, safety requirements and weights totalling 100.",
        );
      if (!(await db.Qualification.exists({ id: req.params.id })))
        throw new HttpError(404, "Qualification not found.");
      const last = await db.QualificationRevision.findOne({
          qualificationId: req.params.id,
        })
          .sort({ version: -1 })
          .lean(),
        revision = {
          ...input,
          id: randomUUID(),
          qualificationId: req.params.id,
          version: (last?.version ?? 0) + 1,
          createdAt: new Date().toISOString(),
          createdBy: req.user.id,
        };
      await db.QualificationRevision.create(revision);
      await log(req, "RUBRIC_VERSION_CREATED", {
        qualificationId: revision.qualificationId,
        version: revision.version,
      });
      res.status(201).json(revision);
    }),
  );
  app.get(
    "/api/manage/calibration",
    wrap(async (_req, res) => {
      const cases = await db.CalibrationCase.find()
          .sort({ createdAt: -1 })
          .limit(100)
          .lean(),
        ratings = await db.CalibrationScore.find({ condition: "calibration" })
          .sort({ createdAt: -1 })
          .limit(500)
          .lean(),
        assessors = (await db.User.find({ role: "assessor" }).lean()).map(
          publicUser,
        );
      res.json({
        cases,
        assessors,
        scores: ratings.map((s) => {
          const c = cases.find((c) => c.id === s.caseId),
            score = calculatePractical(
              s.scores.map((r) => ({ ...r, remark: "" })),
              2,
            ),
            reference = c
              ? calculatePractical(
                  c.referenceScores.map((r) => ({ ...r, remark: "" })),
                  2,
                )
              : null;
          return {
            ...s,
            caseTitle: c?.title ?? s.caseId,
            assessorName:
              assessors.find((a) => a.id === s.assessorId)?.name ??
              s.assessorId,
            score,
            reference,
            deviation: reference === null ? null : score - reference,
          };
        }),
      });
    }),
  );
  app.put(
    "/api/manage/calibration/:id/assign",
    wrap(async (req, res) => {
      const input = z
        .object({ assessorIds: z.array(uuid).max(100) })
        .strict()
        .parse(req.body);
      if (
        (await db.User.countDocuments({
          id: { $in: input.assessorIds },
          role: "assessor",
          accountStatus: { $ne: "INACTIVE" },
        })) !== new Set(input.assessorIds).size
      )
        throw new HttpError(400, "Choose active assessors.");
      const c = await db.CalibrationCase.findOneAndUpdate(
        { id: uuid.parse(req.params.id) },
        { $set: { assignedAssessorIds: [...new Set(input.assessorIds)] } },
        { new: true },
      ).lean();
      if (!c) throw new HttpError(404, "Case not found.");
      await log(req, "CALIBRATION_ASSIGNED", {
        caseId: c.id,
        count: input.assessorIds.length,
      });
      res.json(c);
    }),
  );
  app.get(
    "/api/manage/passports",
    wrap(async (req, res) => {
      const { page, limit } = pagination(req);
      const [items, total] = await Promise.all([
        db.Credential.find()
          .select("-verificationHash")
          .sort({ issuedAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        db.Credential.countDocuments(),
      ]);
      const passports = await db.SkillPassport.find({
        assessmentId: { $in: items.map((c) => c.assessmentId) },
      }).lean();
      res.json({
        items: items.map((c) => ({
          ...c,
          workerName: passports.find((p) => p.assessmentId === c.assessmentId)
            ?.workerName,
        })),
        page,
        total,
      });
    }),
  );
  app.get(
    "/api/manage/passports/:id/history",
    wrap(async (req, res) =>
      res.json(
        await db.AuditLog.find({ "metadata.credentialId": req.params.id })
          .sort({ createdAt: -1 })
          .limit(100)
          .lean(),
      ),
    ),
  );
  app.post(
    "/api/sync/telemetry",
    auth,
    wrap(async (req, res) => {
      const input = z
          .object({
            deviceId: uuid,
            pending: z.number().int().min(0).max(10000),
            failed: z.number().int().min(0).max(10000),
            conflicts: z.number().int().min(0).max(10000),
            drafts: z.number().int().min(0).max(10000),
          })
          .strict()
          .parse(req.body),
        id = req.user.id + ":" + input.deviceId;
      const old = await db.SyncTelemetry.findOne({ id }).lean();
      await db.SyncTelemetry.updateOne(
        { id },
        {
          $set: {
            ...input,
            actorId: req.user.id,
            lastSeenAt: new Date().toISOString(),
          },
          $setOnInsert: { id },
        },
        { upsert: true },
      );
      res.json({ retryRequestedAt: old?.retryRequestedAt ?? null });
    }),
  );
  app.get(
    "/api/manage/sync",
    wrap(async (_req, res) =>
      res.json({
        devices: await db.SyncTelemetry.find()
          .sort({ lastSeenAt: -1 })
          .limit(200)
          .lean(),
        media: await db.MediaIntent.find({ status: "PENDING" })
          .sort({ createdAt: -1 })
          .limit(100)
          .lean(),
      }),
    ),
  );
  app.post(
    "/api/manage/sync/:id/retry",
    wrap(async (req, res) => {
      const c = await db.SyncTelemetry.findOneAndUpdate(
        { id: z.string().max(100).parse(req.params.id) },
        { $set: { retryRequestedAt: new Date().toISOString() } },
        { new: true },
      ).lean();
      if (!c) throw new HttpError(404, "Device report not found.");
      await log(req, "SYNC_RETRY_REQUESTED", {
        deviceId: c.deviceId,
        userId: c.actorId,
      });
      res.json(c);
    }),
  );
  async function analytics() {
    const [assessments, profiles, workers, assessors, admins] =
      await Promise.all([
        db.Assessment.find()
          .select("-responses -aiObservation -history -practical")
          .lean(),
        db.Profile.find().select("userId district trade").lean(),
        db.User.countDocuments({ role: "worker" }),
        db.User.countDocuments({ role: "assessor" }),
        db.User.countDocuments({ role: "admin" }),
      ]);
    const completed = assessments.filter((a) => a.status === "SIGNED_OFF"),
      competent = completed.filter(
        (a) => a.recommendation === "Competent",
      ).length,
      ai = completed.filter((a) => a.aiSuggestedScore !== undefined),
      overrides = ai.filter(
        (a) => a.assessorScore !== a.aiSuggestedScore,
      ).length;
    const group = (key: "district" | "trade") => {
      const counts = new Map<string, number>();
      for (const a of assessments) {
        const k =
          profiles.find((p) => p.userId === a.workerId)?.[key] ||
          "Not provided";
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      return [...counts].map(([name, count]) => ({ name, count }));
    };
    const gaps = new Map<string, number>();
    for (const a of completed)
      for (const c of a.competencyScores)
        if (c.score < 75) gaps.set(c.name, (gaps.get(c.name) ?? 0) + 1);
    return {
      workers,
      assessors,
      admins,
      total: assessments.length,
      pending: assessments.filter((a) => a.status === "SELF_ASSESSED").length,
      inProgress: assessments.filter((a) => a.status === "IN_ASSESSMENT")
        .length,
      completed: completed.length,
      competentRate: completed.length
        ? Math.round((100 * competent) / completed.length)
        : null,
      aiOverrideRate: ai.length
        ? Math.round((100 * overrides) / ai.length)
        : null,
      aiPairs: ai.length,
      trades: group("trade"),
      districts: group("district"),
      gaps: [...gaps].map(([name, count]) => ({ name, count })),
      assessments,
    };
  }
  app.get(
    "/api/manage/analytics",
    wrap(async (_req, res) => {
      const { assessments, ...data } = await analytics();
      res.json(data);
    }),
  );
  app.get(
    "/api/manage/reports.csv",
    wrap(async (req, res) => {
      const data = await analytics(),
        cell = (v: unknown) =>
          '"' +
          String(v ?? "")
            .replace(/^[=+@\-\t\r]/, "'$&")
            .replaceAll('"', '""') +
          '"';
      await log(req, "REPORT_EXPORTED", { records: data.total });
      res
        .type("text/csv")
        .attachment("dakshsetu-assessments.csv")
        .send(
          [
            "assessment_id,status,batch,self_score,practical_score,overall_score,recommendation,signed_off_at",
            ...data.assessments.map((a) =>
              [
                a.id,
                a.status,
                a.batch,
                a.selfAssessmentScore,
                a.assessorScore,
                a.finalScore,
                a.recommendation,
                a.signedOffAt,
              ]
                .map(cell)
                .join(","),
            ),
          ].join("\r\n"),
        );
    }),
  );
}
