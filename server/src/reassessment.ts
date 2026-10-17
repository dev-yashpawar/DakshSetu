import { randomUUID } from "node:crypto";
import type { Express, RequestHandler, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import type { Models } from "./models.js";
import {
  authorizedPassport,
  reconcileCredential,
  passportCompetencies,
} from "./credentials.js";
import { HttpError } from "./services.js";
import {
  normalizeEvidence,
  maxImageBytes,
  type ImageStorage,
} from "./evidence.js";
import { audit } from "./audit.js";
const route =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    void fn(req, res).catch(next);
  };
export function registerReassessmentRoutes(
  app: Express,
  db: Models,
  auth: RequestHandler,
  storage?: ImageStorage,
) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxImageBytes, files: 1, fields: 2 },
  }).single("image");
  const record = async (req: Request) => {
    const r = await db.Reassessment.findOne({
      id: z.string().uuid().parse(req.params.id),
    }).lean();
    if (!r) throw new HttpError(404, "Reassessment not found.");
    if (
      !(req.user.role === "worker" && req.user.id === r.workerId) &&
      !(req.user.role === "assessor" && req.user.id === r.assessorId) &&
      req.user.role !== "admin"
    )
      throw new HttpError(403, "This passport belongs to another assessment.");
    return r;
  };
  app.get(
    "/api/reassessments/assessment/:id",
    auth,
    route(async (req, res) => {
      const { passport } = await authorizedPassport(db, req, req.params.id),
        { history } = await reconcileCredential(db, passport),
        items = await db.Reassessment.find({
          originalAssessmentId: passport.assessmentId,
        })
          .sort({ requestedAt: -1 })
          .lean();
      res
        .set("Cache-Control", "private, no-store")
        .json({
          items,
          weak: passportCompetencies(passport, history).filter(
            (c) => c.score < 75,
          ),
        });
    }),
  );
  app.post(
    "/api/reassessments",
    auth,
    route(async (req, res) => {
      if (req.user.role !== "worker")
        throw new HttpError(403, "Only the worker can request reassessment.");
      const input = z
          .object({
            assessmentId: z.string().uuid(),
            competencyKey: z.string().regex(/^(knowledge|practical):\d{1,2}$/),
          })
          .strict()
          .parse(req.body),
        { assessment, passport } = await authorizedPassport(
          db,
          req,
          input.assessmentId,
        ),
        { history } = await reconcileCredential(db, passport),
        competency = passportCompetencies(passport, history).find(
          (c) => c.key === input.competencyKey,
        );
      if (!competency || competency.score >= 75)
        throw new HttpError(409, "Choose a competency that needs improvement.");
      if (
        (await db.Reassessment.countDocuments({
          originalAssessmentId: assessment.id,
        })) >= 100
      )
        throw new HttpError(
          409,
          "Contact your assessor before requesting another attempt.",
        );
      const openKey = assessment.id + ":" + input.competencyKey;
      let result = await db.Reassessment.findOne({ openKey }).lean();
      if (!result) {
        try {
          result = (
            await db.Reassessment.create({
              id: randomUUID(),
              workerId: req.user.id,
              originalAssessmentId: assessment.id,
              competencyKey: competency.key,
              competency: competency.name,
              previousScore: competency.score,
              assessorId: assessment.assessorId!,
              status: "PENDING",
              version: 0,
              requestedAt: new Date().toISOString(),
              evidenceIds: [],
              openKey,
            })
          ).toObject();
        } catch (e) {
          result = await db.Reassessment.findOne({ openKey }).lean();
          if (!result) throw e;
        }
      }
      await audit(db, {
        id: result.id + ":requested",
        actorId: req.user.id,
        actorRole: "worker",
        assessmentId: assessment.id,
        action: "REASSESSMENT_REQUESTED",
        metadata: { competency: competency.name },
      });
      res.status(201).json(result);
    }),
  );
  app.post(
    "/api/reassessments/:id/evidence",
    auth,
    upload,
    route(async (req, res) => {
      const r = await record(req);
      if (req.user.role !== "assessor" || req.user.id !== r.assessorId)
        throw new HttpError(403, "This area is for assessors.");
      const input = z
        .object({
          uploadId: z.string().uuid(),
          baseVersion: z.coerce.number().int().nonnegative(),
        })
        .strict()
        .parse(req.body);
      if (!req.file) throw new HttpError(400, "Choose an image to upload.");
      const existing = await db.Evidence.findOne({
        id: input.uploadId,
        reassessmentId: r.id,
      }).lean();
      if (existing && r.evidenceIds.includes(existing.id))
        return res.json({ id: existing.id, version: r.version });
      if (r.status !== "PENDING")
        throw new HttpError(423, "This reassessment is complete.");
      if (r.version !== input.baseVersion)
        throw new HttpError(
          409,
          "This reassessment changed. Reload before continuing.",
        );
      if (r.evidenceIds.length >= 3)
        throw new HttpError(409, "Use no more than three new evidence images.");
      if (!storage?.configured)
        throw new HttpError(
          503,
          "Evidence storage is not configured. Add the Cloudinary environment variables and retry.",
        );
      const normalized = await normalizeEvidence(
          req.file.buffer,
          req.file.mimetype,
        ),
        original = await db.Evidence.exists({
          assessmentId: r.originalAssessmentId,
          originalHash: normalized.originalHash,
        });
      if (original)
        throw new HttpError(409, "Use new evidence for this reassessment.");
      const publicId = "dakshsetu/reassessment/" + r.id + "/" + input.uploadId;
      const uploaded = await storage.upload(normalized.bytes, publicId);
      let linked = false;
      try {
        await db.Evidence.create({
          id: input.uploadId,
          reassessmentId: r.id,
          assessmentId: r.originalAssessmentId,
          uploadedBy: req.user.id,
          type: "image",
          url: uploaded.url,
          cloudinaryPublicId: uploaded.publicId,
          filename: "reassessment.jpg",
          mimeType: "image/jpeg",
          size: normalized.bytes.length,
          originalHash: normalized.originalHash,
          createdAt: new Date().toISOString(),
          imageData: normalized.bytes,
        });
        const changed = await db.Reassessment.findOneAndUpdate(
          { id: r.id, status: "PENDING", version: r.version },
          { $push: { evidenceIds: input.uploadId }, $inc: { version: 1 } },
          { new: true },
        ).lean();
        if (!changed)
          throw new HttpError(
            409,
            "This reassessment changed. Reload before continuing.",
          );
        linked = true;
        await audit(db, {
          id: input.uploadId + ":uploaded",
          actorId: req.user.id,
          actorRole: "assessor",
          assessmentId: r.originalAssessmentId,
          action: "IMAGE_EVIDENCE_UPLOADED",
          metadata: { reassessmentId: r.id },
        });
        res.status(201).json({ id: input.uploadId, version: changed.version });
      } catch (e) {
        if (
          !linked &&
          !(await db.Reassessment.exists({
            id: r.id,
            evidenceIds: input.uploadId,
          }))
        ) {
          await db.Evidence.deleteOne({
            id: input.uploadId,
            reassessmentId: r.id,
          });
          await storage.remove(uploaded.publicId).catch(() => {});
        }
        throw e;
      }
    }),
  );
  app.get(
    "/api/reassessments/:id/evidence/:evidenceId",
    auth,
    route(async (req, res) => {
      const r = await record(req),
        key = z.string().uuid().parse(req.params.evidenceId);
      if (!r.evidenceIds.includes(key))
        throw new HttpError(404, "Evidence not found.");
      const e = await db.Evidence.findOne({ id: key, reassessmentId: r.id })
        .select("+imageData")
        .lean();
      if (!e?.imageData) throw new HttpError(404, "Evidence not found.");
      res
        .set({
          "Content-Type": "image/jpeg",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        })
        .send(e.imageData);
    }),
  );
  app.post(
    "/api/reassessments/:id/complete",
    auth,
    route(async (req, res) => {
      const r = await record(req);
      if (req.user.role !== "assessor" || req.user.id !== r.assessorId)
        throw new HttpError(403, "This area is for assessors.");
      const input = z
        .object({
          baseVersion: z.number().int().nonnegative(),
          score: z.number().int().min(0).max(3),
          remark: z.string().trim().min(10).max(2000),
          confirmed: z.literal(true),
        })
        .strict()
        .parse(req.body);
      if (r.status === "COMPLETED") {
        if (r.rating !== input.score || r.remark !== input.remark)
          throw new HttpError(409, "This reassessment is complete.");
        const { passport } = await authorizedPassport(
          db,
          req,
          r.originalAssessmentId,
        );
        await reconcileCredential(db, passport);
        return res.json(r);
      }
      if (r.version !== input.baseVersion)
        throw new HttpError(
          409,
          "This reassessment changed. Reload before continuing.",
        );
      if (
        !r.evidenceIds.length ||
        (await db.Evidence.countDocuments({
          id: { $in: r.evidenceIds },
          reassessmentId: r.id,
        })) !== r.evidenceIds.length
      )
        throw new HttpError(
          409,
          "Upload new evidence before completing reassessment.",
        );
      const last = await db.Reassessment.findOne({
          originalAssessmentId: r.originalAssessmentId,
          status: "COMPLETED",
        })
          .sort({ completedAt: -1 })
          .lean(),
        completedAt = new Date(
          Math.max(Date.now(), Date.parse(last?.completedAt ?? "") + 1 || 0),
        ).toISOString();
      const changed = await db.Reassessment.findOneAndUpdate(
        { id: r.id, status: "PENDING", version: r.version },
        {
          $set: {
            status: "COMPLETED",
            rating: input.score,
            newScore: Math.round((input.score / 3) * 100),
            remark: input.remark,
            completedAt,
          },
          $unset: { openKey: 1 },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      ).lean();
      if (!changed)
        throw new HttpError(
          409,
          "This reassessment changed. Reload before continuing.",
        );
      const { passport } = await authorizedPassport(
          db,
          req,
          r.originalAssessmentId,
        ),
        updated = await reconcileCredential(db, passport);
      await audit(db, {
        id: r.id + ":completed",
        actorId: req.user.id,
        actorRole: "assessor",
        assessmentId: r.originalAssessmentId,
        action: "REASSESSMENT_COMPLETED",
        oldValue: r.previousScore,
        newValue: changed.newScore,
        metadata: { competency: r.competency },
      });
      await audit(db, {
        id: r.id + ":credential",
        actorId: req.user.id,
        actorRole: "assessor",
        assessmentId: r.originalAssessmentId,
        action: "CREDENTIAL_UPDATED",
        metadata: {
          credentialId: updated.credential.credentialId,
          revision: updated.credential.revision,
        },
      });
      res.json(changed);
    }),
  );
}
