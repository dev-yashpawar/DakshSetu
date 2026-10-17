import { audit } from "./audit.js";
import { randomUUID } from "node:crypto";
import type { Express, Request, Response, RequestHandler } from "express";
import { z } from "zod";
import type { Models } from "./models.js";
import { HttpError, publicUser } from "./services.js";
import { getRubric } from "../../shared/assessment.js";
import type { SkillPassport, Assessment } from "../../shared/types.js";

const route =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    void fn(req, res).catch(next);
  };
export async function ensurePassport(db: Models, a: Assessment) {
  if (
    a.status !== "SIGNED_OFF" ||
    a.finalScore === undefined ||
    !a.assessorId ||
    !a.signedOffAt
  )
    throw new HttpError(
      409,
      "A Skill Passport is available only after assessor sign-off.",
    );
  let passport = await db.SkillPassport.findOne({
    assessmentId: a.id,
  }).lean();
  if (!passport) {
    const [worker, profile, storedQ, assessor] = await Promise.all([
      db.User.findOne({ id: a.workerId }).lean(),
      db.Profile.findOne({ userId: a.workerId }).lean(),
      db.Qualification.findOne({ id: a.qualificationId }).lean(),
      db.User.findOne({ id: a.assessorId }).lean(),
    ]);
    const q = a.qualificationSnapshot ?? storedQ;
    if (!worker || !profile || !q || !assessor || !a.practical)
      throw new HttpError(409, "The signed-off record is incomplete.");
    const criteria = getRubric(a.rubricVersion, a.rubricSnapshot).map((r) => ({
      ...r,
      score:
        a.practical!.rubricScores.find((s) => s.criterionId === r.id)?.score ??
        0,
      maxScore: 3,
    }));
    const snapshot: SkillPassport = {
      id: randomUUID(),
      workerId: a.workerId,
      assessmentId: a.id,
      qualificationId: q.id,
      workerName: worker.name,
      trade: profile.trade,
      qualificationTitle: q.title,
      qualificationCode: q.code,
      nsqfLevel: q.nsqfLevel,
      assessorId: assessor.id,
      assessorName: assessor.name,
      overallScore: a.finalScore,
      selfAssessmentScore: a.selfAssessmentScore,
      practicalScore: a.assessorScore ?? a.practicalScore ?? 0,
      competencyScores: a.competencyScores.map((s) => ({
        name: s.name,
        score: s.score,
      })),
      practicalCriteria: criteria.map(
        ({ criterion, section, score, maxScore, weight }) => ({
          criterion,
          section,
          score,
          maxScore,
          weight,
        }),
      ),
      declaredSkills: profile.confirmedSkills,
      strengths: criteria.filter((r) => r.score === 3).map((r) => r.criterion),
      gaps: [
        ...criteria.filter((r) => r.score <= 1).map((r) => r.criterion),
        ...a.competencyScores.filter((s) => s.score < 60).map((s) => s.name),
      ],
      recommendation: a.recommendation!,
      signedOffAt: a.signedOffAt,
      generatedAt: new Date().toISOString(),
    };
    try {
      passport = (await db.SkillPassport.findOneAndUpdate(
        { assessmentId: a.id },
        { $setOnInsert: snapshot },
        { upsert: true, new: true, runValidators: true },
      ).lean())!;
    } catch (error) {
      passport = await db.SkillPassport.findOne({
        assessmentId: a.id,
      }).lean();
      if (!passport) throw error;
    }
  }

  if (!passport)
    throw new HttpError(409, "The signed-off record is incomplete.");
  await audit(db, {
    id: passport.id + ":generated",
    actorId: a.assessorId!,
    actorRole: "assessor",
    assessmentId: a.id,
    action: "SKILL_PASSPORT_GENERATED",
  });
  return passport;
}
export function registerFeatureRoutes(
  app: Express,
  db: Models,
  auth: RequestHandler,
) {
  app.get(
    "/api/passports/:assessmentId",
    auth,
    route(async (req, res) => {
      const passportKey = z.string().uuid().parse(req.params.assessmentId);
      const a = await db.Assessment.findOne({
        $or: [{ id: passportKey }, { workerId: passportKey }],
      }).lean();
      if (!a) throw new HttpError(404, "Assessment not found.");
      if (
        !(req.user.role === "worker" && a.workerId === req.user.id) &&
        !(req.user.role === "assessor" && a.assessorId === req.user.id) &&
        req.user.role !== "admin"
      )
        throw new HttpError(
          403,
          "This passport belongs to another assessment.",
        );
      if (
        a.status !== "SIGNED_OFF" ||
        a.finalScore === undefined ||
        !a.assessorId ||
        !a.signedOffAt
      )
        throw new HttpError(
          409,
          "A Skill Passport is available only after assessor sign-off.",
        );
      res.setHeader("Cache-Control", "private, no-store");
      const passport = await ensurePassport(db, a);
      res.json(passport);
    }),
  );
  const admin: RequestHandler = (req, _res, next) =>
    req.user.role === "admin"
      ? next()
      : next(new HttpError(403, "This area is for administrators."));
  app.use("/api/admin", auth, admin);
  app.get(
    "/api/admin/stats",
    route(async (_req, res) => {
      const [workers, assessors, total, active, completed, pending] =
        await Promise.all([
          db.User.countDocuments({ role: "worker" }),
          db.User.countDocuments({ role: "assessor" }),
          db.Assessment.countDocuments(),
          db.Assessment.countDocuments({ status: "IN_ASSESSMENT" }),
          db.Assessment.countDocuments({ status: "SIGNED_OFF" }),
          db.Assessment.countDocuments({ status: "SELF_ASSESSED" }),
        ]);
      res.json({ workers, assessors, total, active, completed, pending });
    }),
  );
  app.get(
    "/api/admin/qualifications",
    route(async (_req, res) =>
      res.json(await db.Qualification.find().sort({ title: 1 }).lean()),
    ),
  );
  app.get(
    "/api/admin/users",
    route(async (req, res) => {
      const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(10000)
        .default(1)
        .parse(req.query.page);
      const [items, total] = await Promise.all([
        db.User.find()
          .sort({ createdAt: -1, id: 1 })
          .skip((page - 1) * 50)
          .limit(50)
          .lean(),
        db.User.countDocuments(),
      ]);
      res.json({ items: items.map(publicUser), total, page });
    }),
  );
  for (const [path, model] of [
    ["assessments", db.Assessment],
    ["audit-log", db.AuditLog],
  ] as const) {
    app.get(
      path === "audit-log"
        ? ["/api/admin/audit-log", "/api/admin/audit-logs"]
        : "/api/admin/" + path,
      route(async (req, res) => {
        const page = z.coerce
          .number()
          .int()
          .min(1)
          .max(10000)
          .default(1)
          .parse(req.query.page);
        // Projection excludes submitted answers, private evidence and internal retry receipts.
        const selection =
          path === "assessments"
            ? "id workerId assessorId status selfAssessmentScore practicalScore finalScore recommendation createdAt signedOffAt"
            : "-__v";
        const query =
          path === "assessments"
            ? db.Assessment.find()
                .select(selection)
                .sort({ createdAt: -1, id: 1 })
                .skip((page - 1) * 50)
                .limit(50)
                .lean()
            : db.AuditLog.find()
                .sort({ createdAt: -1, id: 1 })
                .skip((page - 1) * 50)
                .limit(50)
                .lean();
        const [items, total] = await Promise.all([
          query,
          path === "assessments"
            ? db.Assessment.countDocuments()
            : db.AuditLog.countDocuments(),
        ]);
        res.json({ items, total, page });
      }),
    );
  }
}
