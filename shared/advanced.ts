import type { AIObservation } from "./types.js";
import type { Rating } from "./consistency.js";
export interface ConsistencyDataset {
  id: string;
  title: string;
  source: "csv";
  uploadedBy: string;
  uploadedAt: string;
  ratings: Rating[];
}
export interface Credential {
  hashVersion?: 1 | 2;
  credentialId: string;
  workerId: string;
  assessmentId: string;
  passportId: string;
  status: "ACTIVE" | "REVOKED" | "UPDATED";
  verificationHash: string;
  issuedAt: string;
  revision: number;
  revokedAt?: string;
  revocationReason?: string;
  revokedBy?: string;
  historyIds: string[];
}
export interface CompetencyRecord {
  key: string;
  name: string;
  score: number;
  source: string;
}
export interface CredentialView {
  credentialId: string;
  status: Credential["status"];
  issuedAt: string;
  revision: number;
  verificationPath: string;
  verificationUrl: string | null;
  history: Reassessment[];
  competencies: CompetencyRecord[];
}
export interface VerificationView {
  credentialStatus?: "ACTIVE" | "UPDATED" | "REVOKED";
  qualification?: string;
  assessorVerified?: boolean;
  issuedAt?: string;
  credentialId?: string;
  status: "VALID" | "REVOKED" | "NOT_FOUND";
  revision?: number;
  workerName?: string;
  trade?: string;
  assessmentDate?: string;
  overallScore?: number;
  verifiedCompetencies?: Omit<CompetencyRecord, "key">[];
  prototype?: boolean;
}
export interface Reassessment {
  id: string;
  workerId: string;
  originalAssessmentId: string;
  competencyKey: string;
  competency: string;
  previousScore: number;
  newScore?: number;
  assessorId: string;
  status: "PENDING" | "COMPLETED";
  requestedAt: string;
  completedAt?: string;
  remark?: string;
  evidenceIds: string[];
  openKey?: string;
  version: number;
  rating?: number;
}
export interface MediaIntent {
  id: string;
  assessmentId: string;
  actorId: string;
  type: "image" | "video";
  mimeType: string;
  filename: string;
  size: number;
  sha256: string;
  status: "PENDING" | "UPLOADED";
  createdAt: string;
}
export interface AIAnalysis {
  id: string;
  assessmentId: string;
  evidenceId: string;
  actorId: string;
  type: "image" | "video";
  observation: AIObservation;
  createdAt: string;
}
export interface CalibrationCase {
  assignedAssessorIds?: string[];
  id: string;
  title: string;
  description: string;
  referenceScores: { criterionId: string; score: number }[];
  rubricVersion: 2;
  createdBy: string;
  createdAt: string;
}
export interface CalibrationScore {
  id: string;
  caseId: string;
  assessorId: string;
  experimentId: string;
  condition: "calibration" | "unassisted" | "assisted";
  scores: { criterionId: string; score: number }[];
  source: "self-entered" | "admin-imported";
  createdAt: string;
}
