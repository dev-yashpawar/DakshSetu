import type { RubricCriterion } from "./assessment.js";
export interface ScoringPolicy {
  selfWeight: number;
  practicalWeight: number;
  competent: number;
  minorGap: number;
  furtherAssessment: number;
}
export const defaultPolicy: ScoringPolicy = {
  selfWeight: 0.3,
  practicalWeight: 0.7,
  competent: 75,
  minorGap: 60,
  furtherAssessment: 40,
};
export interface SystemSettings {
  id: string;
  version: number;
  languages: ("en" | "hi" | "mr")[];
  demoEnabled: boolean;
  activeQualificationId: string;
  policy: ScoringPolicy;
  updatedAt: string;
}
export interface QualificationRevision {
  id: string;
  qualificationId: string;
  version: number;
  taskTitle: string;
  criteria: RubricCriterion[];
  createdAt: string;
  createdBy: string;
}
export interface SyncTelemetry {
  id: string;
  actorId: string;
  deviceId: string;
  pending: number;
  failed: number;
  conflicts: number;
  drafts: number;
  lastSeenAt: string;
  retryRequestedAt?: string;
}
