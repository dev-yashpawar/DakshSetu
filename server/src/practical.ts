import type { Express, RequestHandler, Request } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Models } from "./models.js";
import type { AIConfig } from "./services.js";
import { HttpError } from "./services.js";
import { audit } from "./audit.js";
import { representativeFrames, maxVideoBytes } from "./video.js";
import { observeEvidence } from "./evidence.js";
import { timestampLabel, workerAssessment, privateEvidence } from "../../shared/practical.js";
import type { Assessment, Role } from "../../shared/types.js";

const versionInput = z.object({ baseVersion: z.number().int().nonnegative() }).strict();
const wrap = (fn: (req: Request, res: import("express").Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { void fn(req, res).catch(next); };
export const manualReviewMessage = "AI review unavailable. Continue with manual assessor review.";
export function assertEvidenceEditable(a: Assessment, role: Role) {
  if (!a.practicalTask) return;
  if (role !== "worker") throw new HttpError(403, "The worker must submit evidence for this assigned task.");
  if (a.practicalWorkflow?.submittedAt) throw new HttpError(423, "Evidence is submitted and locked. Ask the assessor to request a new submission.");
}
export function assertReadyForReview(a: Assessment) {
  if (a.practicalTask && (!a.practicalWorkflow?.submittedAt || !["COMPLETED", "FAILED"].includes(a.practicalWorkflow.aiStatus)))
    throw new HttpError(409, "Wait for submitted evidence and the AI first review, or its manual fallback.");
}
export function createPracticalProcessor(db: Models, ai: AIConfig) {
  let running = false;
  return async function processOne() {
    if (running) return;
    running = true;
    try {
      const now = new Date().toISOString(), runId = randomUUID();
      // Durable lease allows another instance to resume a job after a restart.
      const a = await db.Assessment.findOneAndUpdate({
        status: { $ne: "SIGNED_OFF" }, "practicalWorkflow.submittedAt": { $exists: true },
        $or: [{ "practicalWorkflow.aiStatus": "PENDING" }, { "practicalWorkflow.aiStatus": "RUNNING", "practicalWorkflow.leaseUntil": { $lt: now } }],
      }, { $set: { "practicalWorkflow.aiStatus": "RUNNING", "practicalWorkflow.stage": "AI_REVIEWING", "practicalWorkflow.runId": runId, "practicalWorkflow.leaseUntil": new Date(Date.now() + 300000).toISOString(), updatedAt: now }, $inc: { version: 1 } }, { new: true }).lean();
      if (!a) return;
      const workflow = a.practicalWorkflow!;
      const log = async (action: string) => audit(db, { id: `${workflow.submissionId}:${action}:${runId}`, actorId: a.workerId, actorRole: "worker", assessmentId: a.id, action, metadata: { automated: true, submissionId: workflow.submissionId! } });
      await log("AI_REVIEW_STARTED");
      try {
        const video = await db.Evidence.findOne({ id: workflow.reviewEvidenceId, assessmentId: a.id, taskId: a.practicalTask!.taskId, type: "video", uploadedBy: a.workerId }).select("+mediaData").lean();
        if (!video?.mediaData) throw Error("Missing submitted media");
        const sampled = await representativeFrames(Buffer.isBuffer(video.mediaData) ? video.mediaData : Buffer.from(video.mediaData.buffer), video.mimeType, true);
        const worker = await db.User.findOne({ id: a.workerId }).lean();
        const observation = await observeEvidence(sampled.frames, video.id, ai, a.rubricVersion ?? 2, "video", a.rubricSnapshot, {
          frameTimes: sampled.times, duration: sampled.duration, task: a.practicalTask,
          qualification: a.qualificationSnapshot ?? a.qualificationId, language: worker?.preferredLanguage ?? "en",
        });
        observation.observations = observation.observations.map(o => ({ ...o, timestampLabel: timestampLabel(o.timestamp!) }));
        const changed = await db.Assessment.findOneAndUpdate({ id: a.id, "practicalWorkflow.runId": runId, status: { $ne: "SIGNED_OFF" } }, {
          $set: { aiObservation: observation, aiSuggestedScore: Math.round(observation.suggestedScore * 10), "practicalWorkflow.aiStatus": "COMPLETED", "practicalWorkflow.stage": "ASSESSOR_REVIEW_PENDING", "practicalWorkflow.reviewedAt": observation.createdAt, updatedAt: observation.createdAt },
          $unset: { "practicalWorkflow.leaseUntil": 1, "practicalWorkflow.error": 1 }, $inc: { version: 1 },
          $push: { history: { action: "AI_REVIEW_COMPLETED", actorId: a.workerId, at: observation.createdAt } },
        }, { new: true }).lean();
        if (!changed) return; // The task was reassigned while the provider was running.
        await db.Evidence.updateOne({ id: video.id }, { $set: { duration: sampled.duration, analysis: { ...observation, frameTimes: sampled.times, duration: sampled.duration } } });
        await db.AIAnalysis.create({ id: randomUUID(), assessmentId: a.id, evidenceId: video.id, actorId: a.workerId, type: "video", observation, createdAt: observation.createdAt });
        await log("AI_REVIEW_COMPLETED");
      } catch {
        await db.Assessment.updateOne({ id: a.id, "practicalWorkflow.runId": runId, "practicalWorkflow.aiStatus": "RUNNING" }, { $set: { "practicalWorkflow.aiStatus": "FAILED", "practicalWorkflow.stage": "ASSESSOR_REVIEW_PENDING", "practicalWorkflow.error": manualReviewMessage, updatedAt: new Date().toISOString() }, $unset: { "practicalWorkflow.leaseUntil": 1 }, $inc: { version: 1 } });
        await log("AI_REVIEW_FAILED");
      }
    } finally { running = false; }
  };
}
export function registerPracticalRoutes(app: Express, db: Models, auth: RequestHandler, ai: AIConfig, test = false) {
  const processOne = createPracticalProcessor(db, ai);
  const kick = () => { void processOne().catch(() => console.error("Practical review job will retry.")); };
  if (!test) { const timer = setInterval(kick, 5000); timer.unref(); app.locals.stopPracticalReview = () => clearInterval(timer); kick(); }
  async function owned(req: Request) {
    const a = await db.Assessment.findOne({ id: z.string().uuid().parse(req.params.id) }).lean();
    if (!a) throw new HttpError(404, "Assessment not found.");
    if (req.user.role === "worker" ? a.workerId !== req.user.id : req.user.role === "assessor" ? a.assessorId !== req.user.id : req.user.role !== "admin") throw new HttpError(403, "Practical assessment access is restricted.");
    return a;
  }
  async function change(req: Request, a: Assessment, baseVersion: number, action: string, set: Record<string, unknown>, unset: Record<string, number> = {}) {
    if (a.status === "SIGNED_OFF") throw new HttpError(423, "This assessment is signed off and locked.");
    const at = new Date().toISOString();
    const changed = await db.Assessment.findOneAndUpdate({ id: a.id, version: baseVersion, status: { $ne: "SIGNED_OFF" } }, { $set: { ...set, updatedAt: at }, ...(Object.keys(unset).length ? { $unset: unset } : {}), $inc: { version: 1 }, $push: { history: { action, actorId: req.user.id, at } } }, { new: true, runValidators: true }).lean();
    if (!changed) throw new HttpError(409, "The assessment changed. Reload before continuing.");
    await audit(db, { id: `${a.id}:${changed.version}:${action}`, actorId: req.user.id, actorRole: req.user.role, assessmentId: a.id, action, metadata: { taskId: changed.practicalTask?.taskId ?? "", reason: typeof req.body.reason === "string" ? req.body.reason : "", ...(action === "PRACTICAL_TASK_ASSIGNED" ? { previousTask: JSON.stringify(a.practicalTask ?? null), previousPractical: JSON.stringify(a.practical ?? null), previousWorkflow: JSON.stringify(a.practicalWorkflow ?? null), previousEvidenceIds: JSON.stringify(a.evidenceIds), newTask: JSON.stringify(changed.practicalTask) } : {}) } });
    return changed;
  }
  app.get("/api/practical/:id", auth, wrap(async (req, res) => {
    const a = await owned(req);
    const evidence = await db.Evidence.find({ assessmentId: a.id, id: { $in: a.evidenceIds }, ...(a.practicalTask ? { taskId: a.practicalTask.taskId } : {}) }).lean();
    res.set("Cache-Control", "private, no-store").json({ assessment: req.user.role === "worker" ? workerAssessment(a) : a, evidence: evidence.map(e => privateEvidence(e as any)), maxVideoBytes });
  }));
  app.post("/api/practical/:id/assign", auth, wrap(async (req, res) => {
    const a = await owned(req);
    if (req.user.role !== "assessor") throw new HttpError(403, "Only the assigned assessor can assign a practical task.");
    const input = versionInput.extend({ title: z.string().trim().min(5).max(200), instructions: z.array(z.string().trim().min(3).max(500)).min(1).max(15), dueDate: z.string().datetime().optional(), allowImages: z.boolean(), verificationPrompt: z.string().trim().min(10).max(500), reason: z.string().trim().max(1000).default("") }).strict().parse(req.body);
    if (input.dueDate && Date.parse(input.dueDate) <= Date.now()) throw new HttpError(400, "Choose a future due date.");
    if ((a.practicalTask || a.practical || a.evidenceIds.length) && input.reason.length < 10) throw new HttpError(400, "Explain the task reassignment in at least 10 characters.");
    const practicalTask = { taskId: randomUUID(), assessmentId: a.id, candidateId: a.workerId, title: input.title, instructions: input.instructions, qualificationId: a.qualificationId, assignedBy: req.user.id, assignedAt: new Date().toISOString(), dueDate: input.dueDate, verificationPrompt: input.verificationPrompt, allowImages: input.allowImages };
    const changed = await change(req, a, input.baseVersion, "PRACTICAL_TASK_ASSIGNED", { practicalTask, evidenceIds: [], taskTitle: input.title, practicalWorkflow: { stage: "PRACTICAL_ASSIGNED", aiStatus: "NOT_STARTED" } }, { practical: 1, practicalScore: 1, aiObservation: 1, aiSuggestedScore: 1, aiReview: 1, assessorScore: 1, recommendation: 1, overrideReason: 1 });
    res.json(changed);
  }));
  app.post("/api/practical/:id/submit", auth, wrap(async (req, res) => {
    const a = await owned(req), input = versionInput.parse(req.body);
    if (req.user.role !== "worker") throw new HttpError(403, "Only the worker can submit practical evidence.");
    if (a.status === "SIGNED_OFF") throw new HttpError(423, "This assessment is signed off and locked.");
    if (!a.practicalTask) throw new HttpError(409, "Wait for your assessor to assign a practical task.");
    if (a.practicalWorkflow?.submittedAt) return res.json(workerAssessment(a));
    const evidence = await db.Evidence.find({ assessmentId: a.id, taskId: a.practicalTask.taskId, uploadedBy: a.workerId, id: { $in: a.evidenceIds } }).lean();
    const video = evidence.filter(e => e.type === "video").at(-1);
    if (!video) throw new HttpError(409, "Upload a practical video before submitting.");
    const changed = await change(req, a, input.baseVersion, "EVIDENCE_SUBMITTED", { practicalWorkflow: { stage: "EVIDENCE_SUBMITTED", aiStatus: "PENDING", submissionId: randomUUID(), submittedAt: new Date().toISOString(), submittedEvidenceIds: evidence.map(e => e.id), reviewEvidenceId: video.id } });
    res.status(202).json(workerAssessment(changed)); kick();
  }));
  app.post("/api/practical/:id/ai-review", auth, wrap(async (req, res) => {
    const a = await owned(req), input = versionInput.parse(req.body);
    if (req.user.role !== "assessor" || a.practicalWorkflow?.aiStatus !== "FAILED") throw new HttpError(409, "Only the assigned assessor can retry an unavailable AI review.");
    res.json(await change(req, a, input.baseVersion, "AI_REVIEW_RETRY_REQUESTED", { "practicalWorkflow.aiStatus": "PENDING", "practicalWorkflow.stage": "EVIDENCE_SUBMITTED" })); kick();
  }));
  app.delete("/api/practical/:id/evidence/:evidenceId", auth, wrap(async (req, res) => {
    const a = await owned(req), input = versionInput.parse(req.body);
    assertEvidenceEditable(a, req.user.role);
    const evidenceId = z.string().uuid().parse(req.params.evidenceId);
    const e = await db.Evidence.findOne({ id: evidenceId, assessmentId: a.id, uploadedBy: req.user.id, taskId: a.practicalTask?.taskId }).lean();
    if (!a.practicalTask || !e || !a.evidenceIds.includes(evidenceId)) throw new HttpError(404, "Evidence not found.");
    // Retain immutable bytes and audit history; unlink only the editable draft.
    res.json(workerAssessment(await change(req, a, input.baseVersion, "EVIDENCE_DRAFT_REMOVED", { evidenceIds: a.evidenceIds.filter(id => id !== evidenceId) })));
  }));
  app.post("/api/practical/:id/review-start", auth, wrap(async (req, res) => {
    const a = await owned(req), input = versionInput.parse(req.body);
    if (req.user.role !== "assessor") throw new HttpError(403, "Only the assigned assessor can review practical evidence.");
    assertReadyForReview(a);
    if (a.practicalWorkflow?.reviewStartedAt) return res.json(a);
    res.json(await change(req, a, input.baseVersion, "ASSESSOR_REVIEW_STARTED", { "practicalWorkflow.reviewStartedAt": new Date().toISOString() }));
  }));
}
