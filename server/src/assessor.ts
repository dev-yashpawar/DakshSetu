import { savePracticalForId } from "./sync.js";
import type {
  Express,
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import multer from "multer";
import { z } from "zod";
import type { FilterQuery } from "mongoose";
import type { Models } from "./models.js";
import { HttpError, publicUser, type AIConfig } from "./services.js";
import {
  normalizeEvidence,
  observeEvidence,
  maxImageBytes,
  type ImageStorage,
} from "./evidence.js";
import {
  practicalSchema,
  finalizeSchema,
  observationInputSchema,
} from "../../shared/validation.js";
import {
  rubric,
  getRubric,
  practicalTask,
  calculatePractical,
  calculateFinal,
  suggestedRecommendation,
  prototypeScoring,
} from "../../shared/assessment.js";
import type { Assessment, AssessmentEvent } from "../../shared/types.js";
import { createHash } from "node:crypto";
import { audit } from "./audit.js";
import { ensurePassport } from "./features.js";
import { ensureCredential } from "./credentials.js";

const route =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    void fn(req, res).catch(next);
  };
const idSchema = z.string().uuid();
export function registerAssessorRoutes(
  app: Express,
  db: Models,
  requireAuth: RequestHandler,
  ai: AIConfig,
  storage?: ImageStorage,
) {
  const assessor: RequestHandler = (req, _res, next) =>
    req.user.role === "assessor"
      ? next()
      : next(new HttpError(403, "This area is for assessors."));
  const accessible = (actorId: string): FilterQuery<Assessment> => ({
    $or: [
      { assessorId: actorId },
      { assessorId: { $exists: false } },
      { assessorId: null },
    ],
  });
  async function assessmentById(id: string) {
    const a = await db.Assessment.findOne({ id: idSchema.parse(id) }).lean();
    if (!a) throw new HttpError(404, "Assessment not found.");
    return a as Assessment;
  }
  const owned = (a: Assessment, userId: string) => {
    if (a.assessorId !== userId)
      throw new HttpError(
        403,
        "Start this assessment before making changes. It may be assigned to another assessor.",
      );
  };
  const editable = (a: Assessment) => {
    if (a.status === "SIGNED_OFF")
      throw new HttpError(423, "This assessment is signed off and locked.");
  };
  const event = (
    actorId: string,
    action: string,
    details: Partial<AssessmentEvent> = {},
  ): AssessmentEvent => ({
    actorId,
    action,
    at: new Date().toISOString(),
    ...details,
  });
  async function update(
    a: Assessment,
    version: number,
    actorId: string,
    changes: Partial<Assessment>,
    history: AssessmentEvent,
  ) {
    const changed = await db.Assessment.findOneAndUpdate(
      { id: a.id, assessorId: actorId, version, status: { $ne: "SIGNED_OFF" } },
      {
        $set: { ...changes, updatedAt: new Date().toISOString() },
        $inc: { version: 1 },
        $push: { history },
      },
      { new: true, runValidators: true },
    ).lean();
    if (!changed)
      throw new HttpError(
        409,
        "The assessment changed in another session. Reload it before continuing.",
      );
    await audit(db, {
      id: a.id + ":" + changed.version + ":" + history.action,
      actorId,
      actorRole: "assessor",
      assessmentId: a.id,
      action:
        history.action === "PRACTICAL_SCORES_SAVED"
          ? "ASSESSOR_SCORE_CHANGED"
          : history.action,
      oldValue: history.oldScore,
      newValue: history.newScore,
      metadata: {
        ...(history.reason ? { reason: history.reason } : {}),
        ...(changes.recommendation
          ? { recommendation: changes.recommendation }
          : {}),
      },
    });
    if (
      changes.status === "SIGNED_OFF" &&
      a.aiSuggestedScore !== undefined &&
      changes.assessorScore !== a.aiSuggestedScore
    )
      await audit(db, {
        id: a.id + ":override",
        actorId,
        actorRole: "assessor",
        assessmentId: a.id,
        action: "AI_SCORE_OVERRIDDEN",
        oldValue: a.aiSuggestedScore,
        newValue: changes.assessorScore,
        metadata: { reason: changes.overrideReason ?? "" },
      });
    if (changes.status === "SIGNED_OFF" && changes.overrideReason)
      await audit(db, {
        id: a.id + ":reason",
        actorId,
        actorRole: "assessor",
        assessmentId: a.id,
        action: "OVERRIDE_REASON_ADDED",
        metadata: { reason: changes.overrideReason },
      });
    return changed as Assessment;
  }
  async function candidate(workerId: string, actorId: string) {
    const assessment = await db.Assessment.findOne({
      workerId: idSchema.parse(workerId),
      ...accessible(actorId),
    }).lean();
    if (!assessment)
      throw new HttpError(
        404,
        "Candidate not found or assigned to another assessor.",
      );
    const [user, profile, qualification, evidence, assessorUser] =
      await Promise.all([
        db.User.findOne({ id: workerId }).lean(),
        db.Profile.findOne({ userId: workerId }).lean(),
        db.Qualification.findOne({ id: assessment.qualificationId }).lean(),
        db.Evidence.find({
          type: "image",
          id: { $in: assessment.evidenceIds ?? [] },
          assessmentId: assessment.id,
        })
          .sort({ createdAt: 1 })
          .lean(),
        assessment.assessorId
          ? db.User.findOne({ id: assessment.assessorId }).lean()
          : null,
      ]);
    if (!user || !profile || !qualification)
      throw new HttpError(404, "Candidate data is incomplete.");
    return {
      user: publicUser(user),
      profile: { ...profile, status: assessment.status },
      qualification: assessment.qualificationSnapshot ?? qualification,
      assessment,
      evidence,
      assessorName: assessorUser?.name,
    };
  }
  app.use("/api/assessor", requireAuth, assessor);
  app.get(
    "/api/assessor/candidates",
    route(async (req, res) => {
      const assessments = await db.Assessment.find(accessible(req.user.id))
        .sort({ createdAt: -1 })
        .lean();
      const ids = assessments.map((a) => a.workerId);
      const [users, profiles] = await Promise.all([
        db.User.find({ id: { $in: ids } }).lean(),
        db.Profile.find({ userId: { $in: ids } }).lean(),
      ]);
      res.json(
        assessments.flatMap((a) => {
          const u = users.find((u) => u.id === a.workerId),
            p = profiles.find((p) => p.userId === a.workerId);
          return u && p
            ? [
                {
                  user: publicUser(u),
                  profile: { ...p, status: a.status },
                  assessment: a,
                },
              ]
            : [];
        }),
      );
    }),
  );
  app.get(
    "/api/assessor/candidates/:id",
    route(async (req, res) =>
      res.json(await candidate(req.params.id, req.user.id)),
    ),
  );
  app.get(
    "/api/assessor/dashboard",
    route(async (req, res) => {
      const all = await db.Assessment.find(accessible(req.user.id)).lean(),
        assigned = all.filter((a) => a.assessorId === req.user.id);
      res.json({
        assigned: assigned.length,
        available: all.filter((a) => !a.assessorId).length,
        pending: assigned.filter((a) => a.status === "SELF_ASSESSED").length,
        inProgress: assigned.filter((a) => a.status === "IN_ASSESSMENT").length,
        completed: assigned.filter((a) => a.status === "SIGNED_OFF").length,
        requiresReview: assigned.filter(
          (a) =>
            a.status !== "SIGNED_OFF" &&
            (a.aiObservation?.warnings.length ?? 0) > 0,
        ).length,
      });
    }),
  );
  app.post(
    "/api/assessments",
    requireAuth,
    assessor,
    route(async (req, res) => {
      const { workerId } = z
        .object({ workerId: idSchema })
        .strict()
        .parse(req.body);
      const existing = await db.Assessment.findOne({ workerId }).lean();
      if (!existing)
        throw new HttpError(
          409,
          "The worker must complete the self-assessment first.",
        );
      if (existing.status === "SIGNED_OFF")
        throw new HttpError(423, "This assessment is already signed off.");
      if (
        existing.assessorId === req.user.id &&
        existing.status === "IN_ASSESSMENT"
      )
        return res.json(existing);
      const claimed = await db.Assessment.findOneAndUpdate(
        {
          id: existing.id,
          status: "SELF_ASSESSED",
          ...accessible(req.user.id),
        },
        {
          $set: {
            assessorId: req.user.id,
            status: "IN_ASSESSMENT",
            updatedAt: new Date().toISOString(),
          },
          $inc: { version: 1 },
          $push: { history: event(req.user.id, "ASSESSMENT_STARTED") },
        },
        { new: true, runValidators: true },
      ).lean();
      if (!claimed)
        throw new HttpError(
          409,
          "Another assessor has already started this assessment.",
        );
      await db.Profile.updateOne(
        { userId: workerId },
        {
          $set: {
            status: "IN_ASSESSMENT",
            updatedAt: new Date().toISOString(),
          },
          $inc: { version: 1 },
        },
      );
      res.status(201).json(claimed);
    }),
  );
  app.get(
    "/api/assessments/:id",
    requireAuth,
    route(async (req, res) => {
      const a = await assessmentById(req.params.id);
      if (req.user.role === "worker") {
        if (a.workerId !== req.user.id)
          throw new HttpError(403, "This is another worker’s assessment.");
      } else if (req.user.role === "assessor") owned(a, req.user.id);
      else
        throw new HttpError(
          403,
          "This area is for workers and assigned assessors.",
        );
      res.json(a);
    }),
  );
  app.put(
    "/api/assessments/:id/practical",
    requireAuth,
    assessor,
    route(async (req, res) =>
      res.json(
        await savePracticalForId(db, req.user.id, req.params.id, req.body),
      ),
    ),
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxImageBytes, files: 1, fields: 2, parts: 3 },
    fileFilter(_req, file, callback) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype))
        return callback(
          new HttpError(415, "Choose a JPEG, PNG, or WebP image."),
        );
      callback(null, true);
    },
  });
  app.post(
    "/api/assessments/:id/evidence",
    requireAuth,
    upload.single("image"),
    route(async (req, res) => {
      const { uploadId, baseVersion } = z
          .object({
            uploadId: idSchema,
            baseVersion: z.coerce.number().int().nonnegative(),
          })
          .strict()
          .parse(req.body),
        a = await assessmentById(req.params.id);
      if (req.user.role === "worker" && a.workerId === req.user.id) {
      } else if (req.user.role === "assessor") owned(a, req.user.id);
      else throw new HttpError(403, "Evidence access is restricted.");
      editable(a);
      if (a.evidenceIds.includes(uploadId))
        return res.json({
          assessment: a,
          evidence: await db.Evidence.findOne({
            id: uploadId,
            assessmentId: a.id,
          }).lean(),
        });
      if (a.version !== baseVersion)
        throw new HttpError(
          409,
          "The assessment changed. Reload before uploading evidence.",
        );
      if (a.evidenceIds.length >= 6)
        throw new HttpError(
          400,
          "This prototype allows up to six images per assessment.",
        );
      if (!req.file) throw new HttpError(400, "Choose an image to upload.");
      const normalized = await normalizeEvidence(
        req.file.buffer,
        req.file.mimetype,
      );
      const intent = await db.MediaIntent.findOne({
        id: uploadId,
        assessmentId: a.id,
      }).lean();
      if (
        intent &&
        (intent.actorId !== req.user.id ||
          intent.type !== "image" ||
          intent.sha256 !== normalized.originalHash ||
          intent.size !== req.file.buffer.length)
      )
        throw new HttpError(
          400,
          "The uploaded media does not match its saved metadata.",
        );
      if (!storage?.configured)
        throw new HttpError(
          503,
          "Evidence storage is not configured. Add the Cloudinary environment variables and retry.",
          "STORAGE_UNAVAILABLE",
        );
      const uploaded = await storage.upload(
        normalized.bytes,
        `dakshsetu/${a.id}/${uploadId}`,
      );
      let recordCreated = false,
        linked = false;
      try {
        const evidence = await db.Evidence.create({
          id: uploadId,
          assessmentId: a.id,
          uploadedBy: req.user.id,
          type: "image",
          url: uploaded.url,
          cloudinaryPublicId: uploaded.publicId,
          filename: req.file.originalname
            .replace(/[\x00-\x1f\\/]/g, "_")
            .slice(0, 120),
          mimeType: "image/jpeg",
          size: normalized.bytes.length,
          originalHash: normalized.originalHash,
          createdAt: new Date().toISOString(),
          imageData: normalized.bytes,
        });
        recordCreated = true;
        const changed =
          req.user.role === "assessor"
            ? await update(
                a,
                baseVersion,
                req.user.id,
                { evidenceIds: [...a.evidenceIds, uploadId] },
                event(req.user.id, "EVIDENCE_UPLOADED"),
              )
            : await db.Assessment.findOneAndUpdate(
                {
                  id: a.id,
                  workerId: req.user.id,
                  version: baseVersion,
                  status: { $ne: "SIGNED_OFF" },
                },
                {
                  $addToSet: { evidenceIds: uploadId },
                  $inc: { version: 1 },
                  $set: { updatedAt: new Date().toISOString() },
                  $push: {
                    history: event(req.user.id, "WORKER_EVIDENCE_UPLOADED"),
                  },
                },
                { new: true },
              ).lean();
        if (!changed)
          throw new HttpError(
            409,
            "The assessment changed. Reload before uploading evidence.",
          );
        if (req.user.role === "worker")
          await audit(db, {
            id: uploadId + ":uploaded",
            actorId: req.user.id,
            actorRole: "worker",
            assessmentId: a.id,
            action: "IMAGE_EVIDENCE_UPLOADED",
          });
        const { imageData, ...safe } = evidence.toObject();
        linked = true;
        await db.MediaIntent.updateOne(
          { id: uploadId, assessmentId: a.id },
          { $set: { status: "UPLOADED" } },
        );
        res.status(201).json({ assessment: changed, evidence: safe });
      } catch (error) {
        // Preserve an already linked record if a later metadata/audit write fails.
        const applied =
          linked ||
          !!(await db.Assessment.exists({ id: a.id, evidenceIds: uploadId }));
        if (applied) throw error;
        // Compensate only assets created by this failed operation; never remove existing evidence.
        if (recordCreated)
          await db.Evidence.deleteOne({ id: uploadId, assessmentId: a.id });
        await storage
          .remove(uploaded.publicId)
          .catch(() =>
            console.error(
              "Cloudinary upload compensation failed; check the asset ID in storage.",
            ),
          );
        throw error;
      }
    }),
  );
  app.get(
    "/api/assessments/:id/evidence/:evidenceId/content",
    requireAuth,
    route(async (req, res) => {
      const a = await assessmentById(req.params.id);
      if (req.user.role === "worker") {
        if (a.workerId !== req.user.id)
          throw new HttpError(403, "This is another worker’s evidence.");
      } else if (req.user.role === "assessor") owned(a, req.user.id);
      else throw new HttpError(403, "Evidence access is restricted.");
      const id = idSchema.parse(req.params.evidenceId);
      if (!a.evidenceIds.includes(id))
        throw new HttpError(404, "Evidence not found.");
      const evidence = await db.Evidence.findOne({ id, assessmentId: a.id })
        .select("+imageData")
        .lean();
      if (!evidence) throw new HttpError(404, "Evidence not found.");
      if (evidence.type !== "image" || !evidence.imageData)
        throw new HttpError(
          415,
          "Use the video evidence viewer for this file.",
        );
      const bytes = Buffer.isBuffer(evidence.imageData)
        ? evidence.imageData
        : Buffer.from(evidence.imageData.buffer);
      res
        .set({
          "Content-Type": "image/jpeg",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        })
        .send(bytes);
    }),
  );
  app.post(
    "/api/ai/analyze-evidence",
    requireAuth,
    assessor,
    route(async (req, res) => {
      const input = observationInputSchema.parse(req.body),
        a = await assessmentById(input.assessmentId);
      owned(a, req.user.id);
      editable(a);
      if (a.version !== input.baseVersion)
        throw new HttpError(
          409,
          "The assessment changed. Reload before running AI observation.",
        );
      if (!a.evidenceIds.includes(input.evidenceId))
        throw new HttpError(
          404,
          "Evidence does not belong to this assessment.",
        );
      const evidence = await db.Evidence.findOne({
        id: input.evidenceId,
        assessmentId: a.id,
      })
        .select("+imageData")
        .lean();
      if (!evidence) throw new HttpError(404, "Evidence not found.");
      if (evidence.type !== "image" || !evidence.imageData)
        throw new HttpError(415, "Choose image evidence for image analysis.");
      const bytes = Buffer.isBuffer(evidence.imageData)
        ? evidence.imageData
        : Buffer.from(evidence.imageData.buffer);
      const observation = await observeEvidence(
        bytes,
        input.evidenceId,
        ai,
        a.rubricVersion ?? 1,
        "image",
        a.rubricSnapshot,
      );
      await db.AIAnalysis.create({
        id: crypto.randomUUID(),
        assessmentId: a.id,
        evidenceId: input.evidenceId,
        actorId: req.user.id,
        type: "image",
        observation,
        createdAt: observation.createdAt,
      });
      res.json(
        await update(
          a,
          input.baseVersion,
          req.user.id,
          {
            aiObservation: observation,
            aiSuggestedScore: Math.round(observation.suggestedScore * 10),
          },
          event(req.user.id, "AI_EVIDENCE_ANALYZED", {
            newScore: Math.round(observation.suggestedScore * 10),
          }),
        ),
      );
    }),
  );
  app.post(
    "/api/assessments/:id/finalize",
    requireAuth,
    assessor,
    route(async (req, res) => {
      const input = finalizeSchema.parse(req.body),
        a = await assessmentById(req.params.id);
      owned(a, req.user.id);
      editable(a);
      const rubric = getRubric(a.rubricVersion, a.rubricSnapshot);
      if (
        !a.practical ||
        a.practical.rubricScores.length !== rubric.length ||
        !rubric.every((r) =>
          a.practical!.rubricScores.some((s) => s.criterionId === r.id),
        )
      )
        throw new HttpError(
          409,
          "Score and save every rubric criterion before signing off.",
        );
      if (
        !(await db.Evidence.exists({
          assessmentId: a.id,
          id: { $in: a.evidenceIds },
          type: "image",
        }))
      )
        throw new HttpError(
          409,
          "Upload at least one image of practical evidence before signing off.",
        );
      const finalScore = calculateFinal(
        a.selfAssessmentScore,
        input.assessorScore,
        a.scoringPolicy,
      );
      const differsFromAI =
        a.aiSuggestedScore !== undefined &&
        input.assessorScore !== a.aiSuggestedScore;
      const adjusted =
        input.assessorScore !== a.practical.rubricScore ||
        input.recommendation !==
          suggestedRecommendation(finalScore, a.scoringPolicy);
      if ((differsFromAI || adjusted) && input.overrideReason.length < 10)
        throw new HttpError(
          400,
          "Explain your score or recommendation adjustment in at least 10 characters.",
        );
      const changed = await update(
        a,
        input.baseVersion,
        req.user.id,
        {
          status: "SIGNED_OFF",
          practicalScore: input.assessorScore,
          assessorScore: input.assessorScore,
          finalScore,
          recommendation: input.recommendation,
          overrideReason: input.overrideReason,
          signedOffAt: new Date().toISOString(),
        },
        event(req.user.id, "ASSESSMENT_SIGNED_OFF", {
          oldScore: a.practical.rubricScore,
          newScore: input.assessorScore,
          reason: input.overrideReason,
        }),
      );
      await db.Profile.updateOne(
        { userId: a.workerId },
        {
          $set: { status: "SIGNED_OFF", updatedAt: new Date().toISOString() },
          $inc: { version: 1 },
        },
      );
      await ensureCredential(db, await ensurePassport(db, changed));
      res.json(changed);
    }),
  );
}
