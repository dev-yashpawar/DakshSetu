import { Schema, type Connection } from "mongoose";
import type { ConsistencyDataset } from "../../shared/advanced.js";
import type {
  Credential,
  Reassessment,
  MediaIntent,
  AIAnalysis,
  CalibrationCase,
  CalibrationScore,
} from "../../shared/advanced.js";
export function createAdvancedModels(connection: Connection) {
  const dataset = new Schema<ConsistencyDataset>(
    {
      id: { type: String, unique: true, required: true },
      title: { type: String, required: true },
      source: { type: String, enum: ["csv"], required: true },
      uploadedBy: { type: String, required: true },
      uploadedAt: { type: String, required: true },
      ratings: [
        {
          _id: false,
          caseId: String,
          assessorId: String,
          condition: { type: String, enum: ["unassisted", "assisted"] },
          criterionId: String,
          score: { type: Number, min: 0, max: 3 },
        },
      ],
    },
    { versionKey: false },
  );
  const credential = new Schema<Credential>(
    {
      hashVersion: { type: Number, enum: [1, 2] },
      credentialId: { type: String, unique: true, required: true },
      workerId: { type: String, index: true, required: true },
      assessmentId: { type: String, unique: true, required: true },
      passportId: { type: String, required: true },
      status: {
        type: String,
        enum: ["ACTIVE", "REVOKED", "UPDATED"],
        required: true,
      },
      verificationHash: { type: String, required: true },
      issuedAt: { type: String, required: true },
      revision: { type: Number, required: true, min: 1 },
      revokedAt: String,
      revocationReason: String,
      revokedBy: String,
      historyIds: [String],
    },
    { versionKey: false },
  );
  const reassessment = new Schema<Reassessment>(
    {
      id: { type: String, unique: true, required: true },
      workerId: { type: String, index: true, required: true },
      originalAssessmentId: { type: String, index: true, required: true },
      competencyKey: { type: String, required: true },
      competency: { type: String, required: true },
      previousScore: Number,
      newScore: Number,
      version: { type: Number, required: true, default: 0 },
      rating: { type: Number, min: 0, max: 3 },
      assessorId: { type: String, index: true, required: true },
      status: { type: String, enum: ["PENDING", "COMPLETED"], required: true },
      requestedAt: String,
      completedAt: String,
      remark: String,
      evidenceIds: [String],
      openKey: { type: String, unique: true, sparse: true },
    },
    { versionKey: false },
  );
  const intent = new Schema<MediaIntent>(
    {
      id: { type: String, unique: true, required: true },
      assessmentId: { type: String, index: true, required: true },
      actorId: { type: String, required: true },
      type: { type: String, enum: ["image", "video"], required: true },
      mimeType: String,
      filename: String,
      size: Number,
      sha256: String,
      status: { type: String, enum: ["PENDING", "UPLOADED"], required: true },
      createdAt: String,
    },
    { versionKey: false },
  );
  const analysis = new Schema<AIAnalysis>(
    {
      id: { type: String, unique: true, required: true },
      assessmentId: { type: String, index: true, required: true },
      evidenceId: { type: String, index: true, required: true },
      actorId: String,
      type: { type: String, enum: ["image", "video"] },
      observation: { type: Schema.Types.Mixed, required: true },
      createdAt: String,
    },
    { versionKey: false },
  );
  const sample = new Schema<CalibrationCase>(
    {
      assignedAssessorIds: { type: [String], default: undefined },
      id: { type: String, unique: true, required: true },
      title: String,
      description: String,
      referenceScores: [
        {
          _id: false,
          criterionId: String,
          score: { type: Number, min: 0, max: 3 },
        },
      ],
      rubricVersion: { type: Number, enum: [2] },
      createdBy: String,
      createdAt: String,
    },
    { versionKey: false },
  );
  const score = new Schema<CalibrationScore>(
    {
      id: { type: String, unique: true, required: true },
      caseId: { type: String, index: true, required: true },
      assessorId: { type: String, index: true, required: true },
      experimentId: { type: String, index: true, required: true },
      condition: {
        type: String,
        enum: ["calibration", "unassisted", "assisted"],
        required: true,
      },
      scores: [
        {
          _id: false,
          criterionId: String,
          score: { type: Number, min: 0, max: 3 },
        },
      ],
      source: { type: String, enum: ["self-entered", "admin-imported"] },
      createdAt: String,
    },
    { versionKey: false },
  );
  score.index(
    { caseId: 1, assessorId: 1, experimentId: 1, condition: 1 },
    { unique: true },
  );
  return {
    ConsistencyDataset: connection.model<ConsistencyDataset>(
      "ConsistencyDataset",
      dataset,
    ),
    Credential: connection.model<Credential>("Credential", credential),
    Reassessment: connection.model<Reassessment>("Reassessment", reassessment),
    MediaIntent: connection.model<MediaIntent>("MediaIntent", intent),
    AIAnalysis: connection.model<AIAnalysis>("AIAnalysis", analysis),
    CalibrationCase: connection.model<CalibrationCase>(
      "CalibrationCase",
      sample,
    ),
    CalibrationScore: connection.model<CalibrationScore>(
      "CalibrationScore",
      score,
    ),
  };
}
