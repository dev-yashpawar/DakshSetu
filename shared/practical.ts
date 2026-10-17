import type { Assessment, Evidence } from "./types.js";
export type PracticalStage = "PRACTICAL_ASSIGNED" | "EVIDENCE_PENDING" | "EVIDENCE_UPLOADING" | "EVIDENCE_SUBMITTED" | "AI_REVIEWING" | "AI_REVIEW_COMPLETED" | "ASSESSOR_REVIEW_PENDING" | "ASSESSOR_REVIEWED" | "SIGNED_OFF";
export const practicalStageLabels: Record<PracticalStage, string> = {
  PRACTICAL_ASSIGNED: "Task assigned", EVIDENCE_PENDING: "Evidence pending", EVIDENCE_UPLOADING: "Uploading evidence",
  EVIDENCE_SUBMITTED: "Evidence submitted", AI_REVIEWING: "AI review in progress", AI_REVIEW_COMPLETED: "AI review complete",
  ASSESSOR_REVIEW_PENDING: "Assessor review pending", ASSESSOR_REVIEWED: "Assessor reviewed", SIGNED_OFF: "Assessor signed off",
};
export interface PracticalTask {
  taskId: string; assessmentId: string; candidateId: string; title: string;
  instructions: string[]; qualificationId: string; assignedBy: string;
  assignedAt: string; dueDate?: string; verificationPrompt: string; allowImages: boolean;
}
export interface PracticalWorkflow {
  stage: PracticalStage;
  aiStatus: "NOT_STARTED" | "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  submissionId?: string; submittedAt?: string; submittedEvidenceIds?: string[];
  reviewEvidenceId?: string; leaseUntil?: string; runId?: string; error?: string;
  reviewedAt?: string; reviewStartedAt?: string;
}
export const taskInstructions = [
  "Show your face before beginning.", "Show the assessment ID.",
  "Show the tools to be used.", "Follow safety procedure.",
  "Perform the complete practical task.", "Show final testing.",
  "Keep the complete process visible.",
];
export function timestampLabel(seconds: number) {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}
export function workerAssessment(a: Assessment | null): Assessment | null {
  if (!a) return null;
  const copy = { ...a };
  // Never leak internal AI feedback through cached worker API responses or mutation receipts.
  delete copy.aiObservation; delete copy.aiSuggestedScore; delete copy.aiReview;
  delete copy.overrideReason;
  copy.history = [];
  if (copy.practicalWorkflow) {
    const { runId, leaseUntil, ...workflow } = copy.practicalWorkflow;
    copy.practicalWorkflow = workflow;
  }
  if (a.status !== "SIGNED_OFF") {
    delete copy.practical; delete copy.practicalScore; delete copy.assessorScore;
    delete copy.finalScore; delete copy.recommendation;
  }
  return copy;
}
export function privateEvidence(e: Evidence & Record<string, unknown>) {
  const { url, cloudinaryPublicId, analysis, imageData, mediaData, ...safe } = e;
  return safe;
}
export function evidenceLocked(a: Assessment) {
  return !!a.practicalTask && !!a.practicalWorkflow?.submittedAt;
}
