import { randomUUID } from "node:crypto";
import type { Express, RequestHandler, Request, Response } from "express";
import { z } from "zod";
import type { Models } from "./models.js";
import { HttpError } from "./services.js";
import { audit } from "./audit.js";
import { compareRatings, parseRatingsCsv } from "../../shared/consistency.js";
import { rubric, calculatePractical } from "../../shared/assessment.js";
const route =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    void fn(req, res).catch(next);
  };
const scores = z
  .array(
    z
      .object({
        criterionId: z.string(),
        score: z.number().int().min(0).max(3),
      })
      .strict(),
  )
  .length(rubric.length)
  .refine(
    (rows) =>
      new Set(rows.map((r) => r.criterionId)).size === rubric.length &&
      rows.every((r) => rubric.some((c) => c.id === r.criterionId)),
    "Score every rubric criterion.",
  );
export function registerQualityRoutes(
  app: Express,
  db: Models,
  auth: RequestHandler,
) {
  const admin: RequestHandler = (req, _res, next) =>
    req.user.role === "admin"
      ? next()
      : next(new HttpError(403, "This area is for administrators."));
  app.get(
    "/api/admin/quality",
    auth,
    admin,
    route(async (_req, res) => {
      const [datasets, signed, assessors] = await Promise.all([
        db.ConsistencyDataset.find()
          .select("-ratings")
          .sort({ uploadedAt: -1 })
          .limit(30)
          .lean(),
        db.Assessment.find({ status: "SIGNED_OFF" }).lean(),
        db.User.countDocuments({ role: "assessor" }),
      ]);
      const averages = new Map<string, { count: number; sum: number }>();
      let overrides = 0,
        aiPairs = 0,
        aiWithin20 = 0;
      for (const a of signed) {
        if (a.assessorId) {
          const row = averages.get(a.assessorId) ?? { count: 0, sum: 0 };
          row.count++;
          row.sum += a.assessorScore ?? a.practicalScore ?? 0;
          averages.set(a.assessorId, row);
        }
        if (a.practical && a.assessorScore !== a.practicalScore) overrides++;
        if (a.aiSuggestedScore !== undefined && a.assessorScore !== undefined) {
          aiPairs++;
          if (Math.abs(a.aiSuggestedScore - a.assessorScore) <= 20)
            aiWithin20++;
        }
      }
      res.set("Cache-Control", "private, no-store").json({
        datasets,
        assessors,
        completed: signed.length,
        scoreOverrides: overrides,
        aiAgreement: aiPairs ? aiWithin20 / aiPairs : null,
        aiPairs,
        averages: [...averages.entries()].map(([assessorId, v]) => ({
          assessorId,
          count: v.count,
          average: v.sum / v.count,
        })),
      });
    }),
  );
  app.post(
    "/api/admin/quality/datasets",
    auth,
    admin,
    route(async (req, res) => {
      const input = z
        .object({
          title: z.string().trim().min(3).max(100),
          csv: z
            .string()
            .min(1)
            .max(1024 * 1024),
        })
        .strict()
        .parse(req.body);
      let ratings;
      try {
        ratings = parseRatingsCsv(input.csv);
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
      const data = {
        id: randomUUID(),
        title: input.title,
        source: "csv" as const,
        uploadedBy: req.user.id,
        uploadedAt: new Date().toISOString(),
        ratings,
      };
      await db.ConsistencyDataset.create(data);
      await audit(db, {
        id: randomUUID(),
        actorId: req.user.id,
        actorRole: "admin",
        action: "CONSISTENCY_DATASET_IMPORTED",
        metadata: { datasetId: data.id, ratings: ratings.length },
      });
      res.status(201).json({
        ...data,
        ratings: undefined,
        comparison: compareRatings(ratings),
      });
    }),
  );
  app.get(
    "/api/admin/quality/datasets/:id",
    auth,
    admin,
    route(async (req, res) => {
      const data = await db.ConsistencyDataset.findOne({
        id: z.string().uuid().parse(req.params.id),
      }).lean();
      if (!data) throw new HttpError(404, "Dataset not found.");
      res.set("Cache-Control", "private, no-store").json({
        ...data,
        ratings: undefined,
        comparison: compareRatings(data.ratings),
      });
    }),
  );
  app.post(
    "/api/admin/calibration/cases",
    auth,
    admin,
    route(async (req, res) => {
      const input = z
        .object({
          title: z.string().trim().min(3).max(100),
          description: z.string().trim().min(30).max(4000),
          referenceScores: scores,
        })
        .strict()
        .parse(req.body);
      const data = {
        ...input,
        id: randomUUID(),
        rubricVersion: 2 as const,
        createdBy: req.user.id,
        createdAt: new Date().toISOString(),
      };
      await db.CalibrationCase.create(data);
      res.status(201).json(data);
    }),
  );
  app.get(
    "/api/calibration/cases",
    auth,
    route(async (req, res) => {
      if (!["assessor", "admin"].includes(req.user.role))
        throw new HttpError(403, "This area is for assessors.");
      const data = await db.CalibrationCase.find(
        req.user.role === "admin"
          ? {}
          : {
              $or: [
                { assignedAssessorIds: { $exists: false } },
                { assignedAssessorIds: { $size: 0 } },
                { assignedAssessorIds: req.user.id },
              ],
            },
      )
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      res.json(data.map(({ referenceScores, ...c }) => c));
    }),
  );
  app.post(
    "/api/calibration/cases/:id/score",
    auth,
    route(async (req, res) => {
      if (req.user.role !== "assessor")
        throw new HttpError(403, "This area is for assessors.");
      const input = z.object({ scores }).strict().parse(req.body),
        sample = await db.CalibrationCase.findOne({
          id: z.string().uuid().parse(req.params.id),
        }).lean();
      if (!sample) throw new HttpError(404, "Case not found.");
      if (
        sample.assignedAssessorIds?.length &&
        !sample.assignedAssessorIds.includes(req.user.id)
      )
        throw new HttpError(
          403,
          "This practice case is assigned to another assessor.",
        );
      let saved = await db.CalibrationScore.findOne({
        caseId: sample.id,
        assessorId: req.user.id,
        experimentId: "practice",
        condition: "calibration",
      }).lean();
      if (!saved) {
        try {
          saved = (
            await db.CalibrationScore.create({
              id: randomUUID(),
              caseId: sample.id,
              assessorId: req.user.id,
              experimentId: "practice",
              condition: "calibration",
              scores: input.scores,
              source: "self-entered",
              createdAt: new Date().toISOString(),
            })
          ).toObject();
        } catch (e) {
          saved = await db.CalibrationScore.findOne({
            caseId: sample.id,
            assessorId: req.user.id,
            experimentId: "practice",
            condition: "calibration",
          }).lean();
          if (!saved) throw e;
        }
      }
      const score = calculatePractical(
          saved.scores.map((s) => ({ ...s, remark: "" })),
          2,
        ),
        reference = calculatePractical(
          sample.referenceScores.map((s) => ({ ...s, remark: "" })),
          2,
        );
      res.json({
        score,
        reference,
        deviation: score - reference,
        referenceSource:
          "Admin-entered practice reference; not an official benchmark.",
        savedScores: saved.scores,
        criteria: sample.referenceScores.map((r) => ({
          criterionId: r.criterionId,
          reference: r.score,
          score: saved!.scores.find((s) => s.criterionId === r.criterionId)!
            .score,
        })),
      });
    }),
  );
}
