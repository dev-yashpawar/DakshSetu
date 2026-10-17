import type { Express, Request, Response, RequestHandler } from "express";
import { createHash, randomUUID } from "node:crypto";
import multer from "multer";
import { z } from "zod";
import type { Models } from "./models.js";
import { HttpError, type AIConfig } from "./services.js";
import { observeEvidence, type ImageStorage } from "./evidence.js";
import {
  maxVideoBytes,
  validateVideo,
  representativeFrames,
  videoAnalysisAvailable,
} from "./video.js";
import { audit } from "./audit.js";
import { assertEvidenceEditable } from "./practical.js";
const route =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    void fn(req, res).catch(next);
  };
const id = z.string().uuid();
export function registerMediaRoutes(
  app: Express,
  db: Models,
  auth: RequestHandler,
  storage: ImageStorage | undefined,
  ai: AIConfig,
) {
  async function owned(assessmentId: string, req: Request, write = false) {
    const a = await db.Assessment.findOne({
      id: id.parse(assessmentId),
    }).lean();
    if (!a) throw new HttpError(404, "Assessment not found.");
    if (
      !(req.user.role === "assessor" && a.assessorId === req.user.id) &&
      !(req.user.role === "worker" && a.workerId === req.user.id)
    )
      throw new HttpError(403, "This area is for the assigned assessor.");
    if (write && a.status === "SIGNED_OFF")
      throw new HttpError(423, "This assessment is signed off and locked.");
    if (write) assertEvidenceEditable(a, req.user.role);
    return a;
  }
  app.post(
    "/api/assessments/:id/media-intents",
    auth,
    route(async (req, res) => {
      const input = z
          .object({
            id,
            type: z.enum(["image", "video"]),
            mimeType: z.enum([
              "image/jpeg",
              "image/png",
              "image/webp",
              "video/mp4",
              "video/webm",
            ]),
            filename: z.string().min(1).max(150),
            size: z.number().int().positive().max(maxVideoBytes),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            taskId: id.optional(),
          })
          .strict()
          .parse(req.body),
        a = await owned(req.params.id, req, true);
      if(input.taskId !== a.practicalTask?.taskId) throw new HttpError(409, "The practical task changed. Review the device draft before uploading.");
      if (
        (input.type === "image" &&
          (input.size > 5 * 1024 * 1024 ||
            !input.mimeType.startsWith("image/"))) ||
        (input.type === "video" && !input.mimeType.startsWith("video/"))
      )
        throw new HttpError(400, "The media metadata is invalid.");
      const existing = await db.MediaIntent.findOne({ id: input.id }).lean();
      if (
        existing &&
        (existing.assessmentId !== a.id ||
          existing.actorId !== req.user.id ||
          existing.sha256 !== input.sha256 ||
          existing.type !== input.type ||
          existing.size !== input.size ||
          existing.mimeType !== input.mimeType)
      )
        throw new HttpError(
          409,
          "This upload ID is already used for different media.",
        );
      await db.MediaIntent.updateOne(
        { id: input.id },
        {
          $setOnInsert: {
            ...input,
            assessmentId: a.id,
            actorId: req.user.id,
            status: "PENDING",
            createdAt: new Date().toISOString(),
          },
        },
        { upsert: true, runValidators: true },
      );
      res.json({ id: input.id, status: existing?.status ?? "PENDING" });
    }),
  );
  app.get(
    "/api/assessments/:id/videos",
    auth,
    route(async (req, res) => {
      const a = await owned(req.params.id, req);
      res.json({
        items: await db.Evidence.find({
          assessmentId: a.id,
          type: "video",
          id: { $in: a.evidenceIds },
        }).lean(),
        analysisAvailable: await videoAnalysisAvailable(),
      });
    }),
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxVideoBytes, files: 1, fields: 2, parts: 3 },
    fileFilter(_req, file, callback) {
      if (!["video/mp4", "video/webm"].includes(file.mimetype))
        return callback(new HttpError(415, "Choose an MP4 or WebM video."));
      callback(null, true);
    },
  });
  app.post(
    "/api/assessments/:id/videos",
    auth,
    (req, res, next) =>
      upload.single("video")(req, res, (error) => {
        if (error instanceof multer.MulterError)
          return next(
            new HttpError(
              error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
              error.code === "LIMIT_FILE_SIZE"
                ? "The video exceeds the configured upload limit."
                : "Upload one video and try again.",
            ),
          );
        next(error);
      }),
    route(async (req, res) => {
      const { uploadId, baseVersion } = z
          .object({
            uploadId: id,
            baseVersion: z.coerce.number().int().nonnegative(),
          })
          .strict()
          .parse(req.body),
        a = await owned(req.params.id, req, true);
      if (a.evidenceIds.includes(uploadId)) {
        const video = await db.Evidence.findOne({
          id: uploadId,
          assessmentId: a.id,
          type: "video",
        }).lean();
        if (!video)
          throw new HttpError(
            409,
            "This upload ID is already used for different media.",
          );
        return res.json({ assessment: a, evidence: video });
      }
      if (a.version !== baseVersion)
        throw new HttpError(
          409,
          "The assessment changed. Reload before uploading evidence.",
        );
      if (a.evidenceIds.length >= 6)
        throw new HttpError(
          400,
          "This prototype allows up to six evidence items per assessment.",
        );
      if (!req.file) throw new HttpError(400, "Choose a video to upload.");
      validateVideo(req.file.buffer, req.file.mimetype);
      const hash = createHash("sha256").update(req.file.buffer).digest("hex"),
        intent = await db.MediaIntent.findOne({
          id: uploadId,
          assessmentId: a.id,
        }).lean();
      if (
        intent &&
        (intent.actorId !== req.user.id ||
          intent.type !== "video" ||
          intent.sha256 !== hash ||
          intent.size !== req.file.size)
      )
        throw new HttpError(
          400,
          "The uploaded media does not match its saved metadata.",
        );
      if (!storage?.configured || !storage.uploadVideo)
        throw new HttpError(
          503,
          "Video storage is unavailable. Check the server storage configuration.",
        );
      const uploaded = await storage.uploadVideo(
        req.file.buffer,
        `dakshsetu/${a.id}/${uploadId}`,
      );
      let created = false,
        linked = false;
      try {
        const record = await db.Evidence.create({
          id: uploadId,
          assessmentId: a.id,
          uploadedBy: req.user.id,
          candidateId: a.workerId,
          taskId: a.practicalTask?.taskId,
          uploaderRole: req.user.role,
          type: "video",
          url: uploaded.url,
          cloudinaryPublicId: uploaded.publicId,
          filename: req.file.originalname.slice(0, 150),
          mimeType: req.file.mimetype,
          size: req.file.size,
          originalHash: hash,
          mediaData: req.file.buffer,
          createdAt: new Date().toISOString(),
        });
        created = true;
        const at = new Date().toISOString(),
          changed = await db.Assessment.findOneAndUpdate(
            {
              id: a.id,
              version: baseVersion,
              ...(req.user.role === "worker"
                ? { workerId: req.user.id }
                : { assessorId: req.user.id }),
              status: { $ne: "SIGNED_OFF" },
              ...(a.practicalTask ? { "practicalTask.taskId": a.practicalTask.taskId, "practicalWorkflow.submittedAt": { $exists: false } } : {}),
            },
            {
              $addToSet: { evidenceIds: uploadId },
              $inc: { version: 1 },
              $set: { updatedAt: at, ...(a.practicalTask ? { "practicalWorkflow.stage": "EVIDENCE_PENDING" } : {}) },
              $push: {
                history: {
                  actorId: req.user.id,
                  action: "VIDEO_EVIDENCE_UPLOADED",
                  at,
                },
              },
            },
            { new: true, runValidators: true },
          ).lean();
        if (!changed)
          throw new HttpError(
            409,
            "The assessment changed. Reload before uploading evidence.",
          );
        linked = true;
        await db.MediaIntent.updateOne(
          { id: uploadId },
          { $set: { status: "UPLOADED" } },
        );
        await audit(db, {
          id: uploadId + ":uploaded",
          actorId: req.user.id,
          actorRole: req.user.role,
          assessmentId: a.id,
          action: "VIDEO_EVIDENCE_UPLOADED",
        });
        const { mediaData, ...safe } = record.toObject();
        res.status(201).json({ assessment: changed, evidence: safe });
      } catch (error) {
        if (!linked) {
          if (created)
            await db.Evidence.deleteOne({ id: uploadId, assessmentId: a.id });
          await storage
            .removeVideo?.(uploaded.publicId)
            .catch(() => console.error("Video compensation failed."));
        }
        throw error;
      }
    }),
  );
  app.get(
    "/api/assessments/:id/videos/:videoId/content",
    auth,
    route(async (req, res) => {
      const a = await owned(req.params.id, req),
        video = await db.Evidence.findOne({
          id: id.parse(req.params.videoId),
          assessmentId: a.id,
          type: "video",
        })
          .select("+mediaData")
          .lean();
      if (!video || !a.evidenceIds.includes(video.id) || !video.mediaData)
        throw new HttpError(404, "Evidence not found.");
      res
        .set({
          "Content-Type": video.mimeType,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        })
        .send(
          Buffer.isBuffer(video.mediaData)
            ? video.mediaData
            : Buffer.from(video.mediaData.buffer),
        );
    }),
  );
  app.post(
    "/api/assessments/:id/videos/:videoId/analyse",
    auth,
    route(async (req, res) => {
      if (req.user.role !== "assessor")
        throw new HttpError(
          403,
          "Only the assigned assessor can request AI analysis.",
        );
      const input = z
          .object({ baseVersion: z.number().int().nonnegative() })
          .strict()
          .parse(req.body),
        a = await owned(req.params.id, req, true);
      if (a.version !== input.baseVersion)
        throw new HttpError(
          409,
          "The assessment changed in another session. Reload it before continuing.",
        );
      const video = await db.Evidence.findOne({
        id: id.parse(req.params.videoId),
        assessmentId: a.id,
        type: "video",
      })
        .select("+mediaData")
        .lean();
      if (!video || !a.evidenceIds.includes(video.id) || !video.mediaData)
        throw new HttpError(404, "Evidence not found.");
      const sampled = await representativeFrames(
          Buffer.isBuffer(video.mediaData)
            ? video.mediaData
            : Buffer.from(video.mediaData.buffer),
          video.mimeType,
        ),
        observation = await observeEvidence(
          sampled.frames,
          video.id,
          ai,
          a.rubricVersion ?? 1,
          "video",
          a.rubricSnapshot,
        );
      const at = new Date().toISOString(),
        changed = await db.Assessment.findOneAndUpdate(
          {
            id: a.id,
            assessorId: req.user.id,
            version: input.baseVersion,
            status: { $ne: "SIGNED_OFF" },
          },
          {
            $inc: { version: 1 },
            $set: { updatedAt: at },
            $push: {
              history: {
                action: "AI_VIDEO_ANALYSIS_COMPLETED",
                actorId: req.user.id,
                at,
              },
            },
          },
          { new: true },
        ).lean();
      if (!changed)
        throw new HttpError(
          409,
          "The assessment changed in another session. Reload it before continuing.",
        );
      const analysis = {
        ...observation,
        frameTimes: sampled.times,
        duration: sampled.duration,
        sampling: "uniform-resample",
      };
      await db.Evidence.updateOne(
        { id: video.id },
        {
          $set: {
            analysis,
          },
        },
      );
      await db.AIAnalysis.create({
        id: randomUUID(),
        assessmentId: a.id,
        evidenceId: video.id,
        actorId: req.user.id,
        type: "video",
        observation,
        createdAt: at,
      });
      await audit(db, {
        id: a.id + ":" + changed.version + ":video-analysis",
        actorId: req.user.id,
        actorRole: "assessor",
        assessmentId: a.id,
        action: "AI_VIDEO_ANALYSIS_COMPLETED",
        newValue: Math.round(observation.suggestedScore * 10),
      });
      res.json({
        assessment: changed,
        video: { ...video, mediaData: undefined, analysis },
      });
    }),
  );
}
