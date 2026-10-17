export type Role = "worker" | "assessor" | "admin";
export type Language = "en" | "hi" | "mr";
export type Status =
  | "REGISTERED"
  | "DECLARED"
  | "MAPPED"
  | "SELF_ASSESSED"
  | "IN_ASSESSMENT"
  | "SIGNED_OFF";
export interface User {
  accountStatus?: "ACTIVE" | "INACTIVE";
  managementVersion?: number;
  id: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: Role;
  preferredLanguage: Language;
  createdAt: string;
  updatedAt: string;
}
export type PublicUser = Omit<User, "passwordHash">;
export interface Profile {
  declarationMutationId?: string;
  declarationPayloadHash?: string;
  id: string;
  userId: string;
  state: string;
  district: string;
  trade: string;
  yearsExperience: number;
  experienceDescription: string;
  detectedSkills: string[];
  confirmedSkills: string[];
  selectedQualificationId?: string;
  matchScore?: number;
  matchDetails?: Match;
  declarationSource?: "text" | "voice";
  status: Status;
  updatedAt: string;
  version: number;
}
export interface Assessment {
  practicalTask?: import("./practical.js").PracticalTask;
  practicalWorkflow?: import("./practical.js").PracticalWorkflow;
  qualificationSnapshot?: Qualification;
  rubricSnapshot?: import("./assessment.js").RubricCriterion[];
  qualificationRevision?: number;
  taskTitle?: string;
  scoringPolicy?: import("./management.js").ScoringPolicy;
  batch?: string;
  scheduledAt?: string;
  aiReview?: {
    decision: "accepted" | "edited" | "rejected";
    note: string;
    assessorId: string;
    at: string;
    analysisCreatedAt: string;
  };
  id: string;
  workerId: string;
  qualificationId: string;
  status: "SELF_ASSESSED" | "IN_ASSESSMENT" | "SIGNED_OFF";
  assessorId?: string;
  version: number;
  practical?: PracticalAssessment;
  practicalScore?: number;
  assessorScore?: number;
  aiSuggestedScore?: number;
  aiObservation?: AIObservation;
  finalScore?: number;
  recommendation?: Recommendation;
  overrideReason?: string;
  signedOffAt?: string;
  evidenceIds: string[];
  history: AssessmentEvent[];
  responses: { questionId: string; answer: number }[];
  selfAssessmentScore: number;
  competencyScores: { name: string; score: number }[];
  createdAt: string;
  updatedAt: string;
  profileVersion: number;
  rubricVersion?: number;
}
export type Recommendation =
  | "Competent"
  | "Competent with minor skill-gap training"
  | "Further assessment required"
  | "Not yet competent";
export interface RubricScore {
  criterionId: string;
  score: number;
  remark: string;
  criterion?: string;
  category?: string;
  maxScore?: number;
  weight?: number;
  mandatory?: boolean;
  evidenceIds?: string[];
}
export interface PracticalAssessment {
  taskTitle: string;
  rubricScores: RubricScore[];
  rubricScore: number;
  updatedAt: string;
}
export interface AssessmentEvent {
  action: string;
  actorId: string;
  at: string;
  oldScore?: number;
  newScore?: number;
  reason?: string;
  mutationId?: string;
  payloadHash?: string;
}

export interface SkillPassport {
  id: string;
  workerId: string;
  assessmentId: string;
  qualificationId: string;
  workerName: string;
  trade: string;
  qualificationTitle: string;
  qualificationCode: string;
  nsqfLevel: number;
  assessorId: string;
  assessorName: string;
  overallScore: number;
  selfAssessmentScore: number;
  practicalScore: number;
  competencyScores: { name: string; score: number }[];
  practicalCriteria: {
    criterion: string;
    section: string;
    score: number;
    maxScore: number;
    weight: number;
  }[];
  declaredSkills: string[];
  strengths: string[];
  gaps: string[];
  recommendation: Recommendation;
  signedOffAt: string;
  generatedAt: string;
}
export interface AuditLog {
  id: string;
  actorId: string;
  actorRole: Role | "public";
  assessmentId?: string;
  action: string;
  oldValue?: number;
  newValue?: number;
  metadata: Record<string, string | number | boolean>;
  createdAt: string;
}
export interface Evidence {
  candidateId?: string;
  taskId?: string;
  uploaderRole?: Role;
  duration?: number;
  reassessmentId?: string;
  id: string;
  assessmentId: string;
  uploadedBy: string;
  type: "image" | "video";
  url: string;
  cloudinaryPublicId: string;
  filename: string;
  mimeType: "image/jpeg" | "video/mp4" | "video/webm";
  size: number;
  originalHash: string;
  createdAt: string;
}
export interface AIObservation {
  evidenceId: string;
  observations: {
    timestamp?: number;
    timestampLabel?: string;
    type?: "info" | "warning" | "safety-critical" | "positive";
    criterionId: string;
    criterion: string;
    status: "observed" | "warning" | "unclear";
    confidence: number;
    evidence?: string;
  }[];
  warnings: string[];
  suggestedScores?: { criterionId: string; score: number; maxScore: 3; reason: string }[];
  suggestedScore: number;
  maxScore: 10;
  summary: string;
  limitations: string[];
  createdAt: string;
}
export interface Candidate {
  user: PublicUser;
  profile: Profile;
  assessment: Assessment;
  qualification: Qualification;
  evidence: Evidence[];
  assessorName?: string;
}
export interface CandidateSummary {
  user: PublicUser;
  profile: Profile;
  assessment: Assessment;
}
export interface Qualification {
  revision?: number;
  active?: boolean;
  trade?: string;
  sourceUrl?: string;
  id: string;
  title: string;
  code: string;
  nsqfLevel: number;
  sector: string;
  skills: string[];
  tasks: string[];
  nos: string[];
  isDemo: boolean;
}
export interface Question {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  competency: string;
  weight: number;
}
export interface Match {
  qualification: Qualification;
  matchScore: number;
  matchedSkills: string[];
  gaps: string[];
  explanation: string;
  qualificationId?: string;
  partialMatches?: { skill: string; source: string }[];
}
export interface WorkerState {
  profile: Profile;
  assessment: Assessment | null;
  user: PublicUser;
}
