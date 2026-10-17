import { getSettings } from "./management.js";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Express, RequestHandler } from "express";
import type { Models } from "./models.js";
import type { Assessment, User } from "../../shared/types.js";
import { HttpError } from "./services.js";
import {
  practicalSchema,
  selfSchema,
  experienceSchema,
} from "../../shared/validation.js";
import {
  calculatePractical,
  practicalTask,
  getRubric,
} from "../../shared/assessment.js";
import { questions } from "./questions.js";
import { audit } from "./audit.js";
import { assertReadyForReview } from "./practical.js";

export async function savePracticalForId(
  db: Models,
  actorId: string,
  assessmentId: string,
  payload: unknown,
): Promise<Assessment> {
  const input = practicalSchema.parse(payload);
  const a = await db.Assessment.findOne({
    id: z.string().uuid().parse(assessmentId),
  }).lean();
  if (!a) throw new HttpError(404, "Assessment not found.");
  if (a.assessorId !== actorId)
    throw new HttpError(
      403,
      "Start this assessment before making changes. It may be assigned to another assessor.",
    );
  const hash = createHash("sha256")
    .update(
      JSON.stringify(
        [...input.rubricScores].sort((a, b) =>
          a.criterionId.localeCompare(b.criterionId),
        ),
      ),
    )
    .digest("hex");
  const receipt =
    input.clientMutationId &&
    a.history.find((e) => e.mutationId === input.clientMutationId);
  if (receipt) {
    if (receipt.payloadHash !== hash)
      throw new HttpError(
        409,
        "This saved update has different content. Review the device draft.",
      );
    return a;
  }
  if (a.status === "SIGNED_OFF")
    throw new HttpError(423, "This assessment is signed off and locked.");
  assertReadyForReview(a);
  const definition = getRubric(a.rubricVersion, a.rubricSnapshot);
  if (
    input.rubricScores.some(
      (s) =>
        !definition.some((r) => r.id === s.criterionId) ||
        s.evidenceIds.some((id) => !a.evidenceIds.includes(id)),
    )
  )
    throw new HttpError(
      400,
      "Choose criteria and evidence from this assessment only.",
    );
  const storedRows = input.rubricScores.map((s) => {
    const r = definition.find((r) => r.id === s.criterionId)!;
    return {
      ...s,
      criterion: r.criterion,
      category: r.section,
      maxScore: 3,
      weight: r.weight,
      mandatory: r.mandatory,
    };
  });
  const score = calculatePractical(
      input.rubricScores,
      a.rubricVersion ?? 1,
      a.rubricSnapshot,
    ),
    now = new Date().toISOString();
  const updated = await db.Assessment.findOneAndUpdate(
    {
      id: a.id,
      assessorId: actorId,
      version: input.baseVersion,
      status: { $ne: "SIGNED_OFF" },
    },
    {
      $set: {
        practical: {
          taskTitle: a.taskTitle ?? practicalTask,
          rubricScores: storedRows,
          rubricScore: score,
          updatedAt: now,
        },
        practicalScore: score,
        ...(a.practicalWorkflow ? { "practicalWorkflow.stage": "ASSESSOR_REVIEWED", "practicalWorkflow.reviewStartedAt": a.practicalWorkflow.reviewStartedAt ?? now } : {}),
        updatedAt: now,
      },
      $inc: { version: 1 },
      $push: {
        history: {
          actorId,
          action: "PRACTICAL_SCORES_SAVED",
          at: now,
          oldScore: a.practical?.rubricScore,
          newScore: score,
          ...(input.clientMutationId
            ? { mutationId: input.clientMutationId, payloadHash: hash }
            : {}),
        },
      },
    },
    { new: true, runValidators: true },
  ).lean();
  if (!updated) {
    const latest = await db.Assessment.findOne({ id: a.id }).lean();
    if (
      input.clientMutationId &&
      latest?.history.some(
        (e) =>
          e.mutationId === input.clientMutationId && e.payloadHash === hash,
      )
    )
      return latest;
    throw new HttpError(
      409,
      "The assessment changed in another session. Reload it before continuing.",
    );
  }
  await audit(db, {
    id: a.id + ":" + updated.version + ":practical",
    actorId,
    actorRole: "assessor",
    assessmentId: a.id,
    action: "ASSESSOR_SCORE_CHANGED",
    oldValue: a.practical?.rubricScore,
    newValue: score,
  });
  if(a.practicalTask) await audit(db, { id: a.id + ":" + updated.version + ":review", actorId, actorRole: "assessor", assessmentId: a.id, action: "ASSESSOR_SCORE_SAVED", oldValue: a.practical?.rubricScore, newValue: score });
  return updated;
}
export async function syncDeclaration(
  db: Models,
  actorId: string,
  mutationId: string,
  payload: unknown,
) {
  const input = experienceSchema
    .extend({ baseVersion: z.number().int().nonnegative() })
    .strict()
    .parse(payload);
  const p = await db.Profile.findOne({ userId: actorId }).lean();
  if (!p) throw new HttpError(404, "Worker profile was not found.");
  const { baseVersion, ...changes } = input,
    hash = createHash("sha256").update(JSON.stringify(changes)).digest("hex");
  if (p.declarationMutationId === mutationId) {
    if (p.declarationPayloadHash !== hash)
      throw new HttpError(
        409,
        "This saved update has different content. Review the device draft.",
      );
    return p;
  }
  if (await db.Assessment.exists({ workerId: actorId }))
    throw new HttpError(423, "An assessment already uses this declaration.");
  const saved = await db.Profile.findOneAndUpdate(
    {
      userId: actorId,
      version: baseVersion,
      status: { $nin: ["SELF_ASSESSED", "IN_ASSESSMENT", "SIGNED_OFF"] },
    },
    {
      $set: {
        ...changes,
        status: "DECLARED",
        detectedSkills: [],
        confirmedSkills: [],
        selectedQualificationId: "",
        matchScore: 0,
        matchDetails: null,
        declarationMutationId: mutationId,
        declarationPayloadHash: hash,
        updatedAt: new Date().toISOString(),
      },
      $inc: { version: 1 },
    },
    { new: true },
  ).lean();
  if (!saved)
    throw new HttpError(
      409,
      "Your profile changed. Review the server record before using this draft.",
    );
  await audit(db, {
    id: mutationId + ":declaration",
    actorId,
    actorRole: "worker",
    action:
      input.declarationSource === "voice"
        ? "VOICE_TRANSCRIPT_SAVED"
        : "EXPERIENCE_DECLARATION_SYNCED",
    metadata: { characters: changes.experienceDescription.length },
  });
  return saved;
}
export async function submitSelfAssessment(
  db: Models,
  actorId: string,
  payload: unknown,
) {
  const input = selfSchema.strict().parse(payload),
    p = await db.Profile.findOne({ userId: actorId }).lean();
  if (!p) throw new HttpError(404, "Worker profile was not found.");
  const existing = await db.Assessment.findOne({ workerId: actorId }).lean();
  if (existing) return { assessment: existing, created: false };
  if (
    (input.profileVersion !== undefined &&
      input.profileVersion !== p.version) ||
    (input.qualificationId !== undefined &&
      input.qualificationId !== p.selectedQualificationId)
  )
    throw new HttpError(
      409,
      "Your profile changed. Review the saved questions before submitting.",
    );
  if (!p.selectedQualificationId || p.status !== "MAPPED")
    throw new HttpError(409, "Confirm a qualification match first.");
  const ids = input.responses.map((r) => r.questionId);
  if (
    new Set(ids).size !== questions.length ||
    !questions.every((q) => ids.includes(q.id))
  )
    throw new HttpError(400, "Answer each assessment question exactly once.");
  const scores = questions.map((q) => ({
    name: q.competency,
    score:
      input.responses.find((r) => r.questionId === q.id)!.answer ===
      q.correctAnswer
        ? 100
        : 0,
  }));
  const score = questions.reduce(
      (sum, q) =>
        sum +
        (input.responses.find((r) => r.questionId === q.id)!.answer ===
        q.correctAnswer
          ? q.weight
          : 0),
      0,
    ),
    now = new Date().toISOString();
  const settings = await getSettings(db);
  const qualificationSnapshot = await db.Qualification.findOne({
    id: p.selectedQualificationId,
  }).lean();
  const revision = await db.QualificationRevision.findOne({
    qualificationId: p.selectedQualificationId,
  })
    .sort({ version: -1 })
    .lean();
  const assessment: Assessment = {
    ...(qualificationSnapshot ? { qualificationSnapshot } : {}),
    scoringPolicy: settings.policy,
    ...(revision
      ? {
          rubricSnapshot: revision.criteria,
          qualificationRevision: revision.version,
          taskTitle: revision.taskTitle,
        }
      : {}),
    id: randomUUID(),
    workerId: actorId,
    qualificationId: p.selectedQualificationId,
    status: "SELF_ASSESSED",
    responses: input.responses,
    selfAssessmentScore: score,
    competencyScores: scores,
    createdAt: now,
    updatedAt: now,
    profileVersion: p.version,
    rubricVersion: 2,
    version: 0,
    evidenceIds: [],
    history: [],
  };
  const updated = await db.Profile.findOneAndUpdate(
    { id: p.id, version: p.version },
    { $set: { status: "SELF_ASSESSED", updatedAt: now }, $inc: { version: 1 } },
    { new: true, runValidators: true },
  );
  if (!updated)
    throw new HttpError(
      409,
      "Your profile changed in another session. Reload before continuing.",
    );
  try {
    await db.Assessment.create(assessment);
  } catch (error) {
    const saved = await db.Assessment.findOne({ workerId: actorId }).lean();
    if (saved) return { assessment: saved, created: false };
    await db.Profile.updateOne(
      { id: p.id, status: "SELF_ASSESSED", version: p.version + 1 },
      { $set: { status: "MAPPED" }, $inc: { version: 1 } },
    );
    throw error;
  }
  await audit(db, {
    id: assessment.id + ":self",
    actorId,
    actorRole: "worker",
    assessmentId: assessment.id,
    action: "SELF_ASSESSMENT_COMPLETED",
    newValue: score,
  });
  return { assessment, created: true };
}
const itemSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: z.string().uuid(),
      type: z.literal("declaration"),
      resourceId: z.string().uuid(),
      payload: experienceSchema
        .extend({ baseVersion: z.number().int().nonnegative() })
        .strict(),
    })
    .strict(),
  z
    .object({
      id: z.string().uuid(),
      type: z.literal("practical"),
      resourceId: z.string().uuid(),
      payload: practicalSchema,
    })
    .strict(),
  z
    .object({
      id: z.string().uuid(),
      type: z.literal("self"),
      resourceId: z.string().max(100),
      payload: selfSchema
        .extend({
          profileVersion: z.number().int().nonnegative(),
          qualificationId: z.string().max(100),
        })
        .strict(),
    })
    .strict(),
]);
export function registerSyncRoutes(
  app: Express,
  db: Models,
  auth: RequestHandler,
) {
  app.post("/api/sync", auth, (req, res, next) => {
    void (async () => {
      const { items } = z
          .object({ items: z.array(itemSchema).min(1).max(10) })
          .strict()
          .parse(req.body),
        results = [];
      for (const item of items) {
        try {
          if (
            (item.type === "practical" && req.user.role !== "assessor") ||
            ((item.type === "self" || item.type === "declaration") &&
              req.user.role !== "worker")
          )
            throw new HttpError(
              403,
              "This account cannot sync that type of assessment.",
            );
          const data =
            item.type === "declaration"
              ? await syncDeclaration(db, req.user.id, item.id, item.payload)
              : item.type === "practical"
                ? await savePracticalForId(db, req.user.id, item.resourceId, {
                    ...item.payload,
                    clientMutationId: item.id,
                  })
                : (await submitSelfAssessment(db, req.user.id, item.payload))
                    .assessment;
          results.push({
            id: item.id,
            status: "synced",
            httpStatus: 200,
            data,
          });
        } catch (error) {
          if (error instanceof HttpError)
            results.push({
              id: item.id,
              status:
                error.status === 409 || error.status === 423
                  ? "conflict"
                  : "failed",
              httpStatus: error.status,
              error: error.message,
            });
          else if (error instanceof z.ZodError)
            results.push({
              id: item.id,
              status: "failed",
              httpStatus: 400,
              error: "Invalid sync item.",
            });
          else throw error;
        }
      }
      res.json({ results });
    })().catch(next);
  });
}
