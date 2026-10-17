import mongoose, { Schema, type Connection } from "mongoose";
import { createAdvancedModels } from "./advanced-models.js";
import { createManagementModels } from "./management-models.js";
import type {
  User,
  Profile,
  Qualification,
  Assessment,
  Evidence,
  SkillPassport,
  AuditLog,
} from "../../shared/types.js";

// Practical scoring and sign-off are embedded for atomic assessment updates.
export function createModels(connection: Connection) {
  const common = {
    id: { type: String, required: true, unique: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  };
  const userSchema = new Schema<User>(
    {
      ...common,
      accountStatus: {
        type: String,
        enum: ["ACTIVE", "INACTIVE"],
        default: "ACTIVE",
      },
      managementVersion: { type: Number, default: 0 },
      name: { type: String, required: true },
      email: { type: String, required: true, unique: true },
      phone: { type: String, required: true },
      passwordHash: { type: String, required: true, select: false },
      role: {
        type: String,
        enum: ["worker", "assessor", "admin"],
        required: true,
      },
      preferredLanguage: {
        type: String,
        enum: ["en", "hi", "mr"],
        default: "en",
      },
    },
    { versionKey: false },
  );
  const profileSchema = new Schema<Profile>(
    {
      declarationMutationId: String,
      declarationPayloadHash: String,
      id: { type: String, required: true, unique: true },
      userId: { type: String, required: true, unique: true },
      state: { type: String, default: "" },
      district: { type: String, default: "" },
      trade: { type: String, default: "" },
      yearsExperience: { type: Number, min: 0, max: 70, default: 0 },
      experienceDescription: { type: String, default: "" },
      detectedSkills: [String],
      confirmedSkills: [String],
      selectedQualificationId: String,
      matchScore: Number,
      matchDetails: Schema.Types.Mixed,
      declarationSource: { type: String, enum: ["text", "voice"] },
      status: {
        type: String,
        enum: [
          "REGISTERED",
          "DECLARED",
          "MAPPED",
          "SELF_ASSESSED",
          "IN_ASSESSMENT",
          "SIGNED_OFF",
        ],
        default: "REGISTERED",
      },
      updatedAt: { type: String, required: true },
      version: { type: Number, default: 0 },
    },
    { versionKey: false },
  );
  const qualificationSchema = new Schema<Qualification>(
    {
      id: { type: String, unique: true, required: true },
      title: String,
      code: { type: String, unique: true },
      nsqfLevel: Number,
      sector: String,
      skills: [String],
      tasks: [String],
      nos: [String],
      isDemo: Boolean,
      revision: Number,
      active: Boolean,
      trade: String,
      sourceUrl: String,
    },
    { versionKey: false },
  );
  const assessmentSchema = new Schema<Assessment>(
    {
      ...common,
      workerId: { type: String, required: true, unique: true },
      qualificationId: { type: String, required: true },
      status: {
        type: String,
        enum: ["SELF_ASSESSED", "IN_ASSESSMENT", "SIGNED_OFF"],
        required: true,
      },
      assessorId: String,
      qualificationSnapshot: Schema.Types.Mixed,
      rubricSnapshot: { type: [Schema.Types.Mixed], default: undefined },
      qualificationRevision: Number,
      taskTitle: String,
      practicalTask: Schema.Types.Mixed,
      practicalWorkflow: Schema.Types.Mixed,
      scoringPolicy: Schema.Types.Mixed,
      batch: String,
      scheduledAt: String,
      aiReview: Schema.Types.Mixed,
      rubricVersion: { type: Number, enum: [1, 2] },
      version: { type: Number, default: 0, required: true },
      practical: {
        type: new Schema(
          {
            taskTitle: String,
            rubricScores: [
              {
                _id: false,
                criterionId: String,
                score: { type: Number, min: 0, max: 3 },
                remark: String,
                criterion: String,
                category: String,
                maxScore: Number,
                weight: Number,
                mandatory: Boolean,
                evidenceIds: [String],
              },
            ],
            rubricScore: { type: Number, min: 0, max: 100 },
            updatedAt: String,
          },
          { _id: false },
        ),
        required: false,
      },
      practicalScore: { type: Number, min: 0, max: 100 },
      assessorScore: { type: Number, min: 0, max: 100 },
      aiSuggestedScore: { type: Number, min: 0, max: 100 },
      aiObservation: {
        type: new Schema(
          {
            evidenceId: String,
            observations: [
              new Schema({
                criterionId: String,
                criterion: String,
                status: String,
                confidence: Number,
                evidence: String,
                timestamp: Number,
                timestampLabel: String,
                type: String,
              }, { _id: false }),
            ],
            warnings: [String],
            suggestedScores: { type: [Schema.Types.Mixed], default: undefined },
            suggestedScore: Number,
            maxScore: Number,
            summary: String,
            limitations: [String],
            createdAt: String,
          },
          { _id: false },
        ),
        required: false,
      },
      finalScore: { type: Number, min: 0, max: 100 },
      recommendation: String,
      overrideReason: String,
      signedOffAt: String,
      evidenceIds: { type: [String], default: [] },
      history: {
        type: [
          new Schema(
            {
              action: String,
              actorId: String,
              at: String,
              oldScore: Number,
              newScore: Number,
              reason: String,
              mutationId: String,
              payloadHash: String,
            },
            { _id: false },
          ),
        ],
        default: [],
      },
      responses: [{ _id: false, questionId: String, answer: Number }],
      selfAssessmentScore: { type: Number, min: 0, max: 100, required: true },
      competencyScores: [{ _id: false, name: String, score: Number }],
      profileVersion: { type: Number, required: true },
    },
    { versionKey: false },
  );
  const evidenceSchema = new Schema<
    Evidence & { imageData?: Buffer; mediaData?: Buffer; analysis?: unknown }
  >(
    {
      reassessmentId: { type: String, index: true },
      candidateId: String,
      taskId: String,
      uploaderRole: String,
      duration: Number,
      id: { type: String, required: true, unique: true },
      assessmentId: { type: String, required: true, index: true },
      uploadedBy: { type: String, required: true },
      type: { type: String, enum: ["image", "video"], required: true },
      url: { type: String, required: true },
      cloudinaryPublicId: { type: String, required: true },
      filename: String,
      mimeType: {
        type: String,
        enum: ["image/jpeg", "video/mp4", "video/webm"],
        required: true,
      },
      size: Number,
      originalHash: String,
      createdAt: { type: String, required: true },
      imageData: { type: Buffer, select: false },
      mediaData: { type: Buffer, select: false },
      analysis: Schema.Types.Mixed,
    },
    { versionKey: false },
  );
  const passportSchema = new Schema<SkillPassport>(
    {
      id: { type: String, required: true, unique: true },
      workerId: { type: String, required: true, index: true },
      assessmentId: { type: String, required: true, unique: true },
      qualificationId: String,
      workerName: String,
      trade: String,
      qualificationTitle: String,
      qualificationCode: String,
      nsqfLevel: Number,
      assessorId: String,
      assessorName: String,
      overallScore: Number,
      selfAssessmentScore: Number,
      practicalScore: Number,
      competencyScores: [{ _id: false, name: String, score: Number }],
      practicalCriteria: [
        {
          _id: false,
          criterion: String,
          section: String,
          score: Number,
          maxScore: Number,
          weight: Number,
        },
      ],
      declaredSkills: [String],
      strengths: [String],
      gaps: [String],
      recommendation: String,
      signedOffAt: String,
      generatedAt: String,
    },
    { versionKey: false },
  );
  const auditSchema = new Schema<AuditLog>(
    {
      id: { type: String, required: true, unique: true },
      actorId: { type: String, required: true },
      actorRole: {
        type: String,
        enum: ["worker", "assessor", "admin", "public"],
        required: true,
      },
      assessmentId: { type: String, index: true },
      action: { type: String, required: true, index: true },
      oldValue: Number,
      newValue: Number,
      metadata: { type: Schema.Types.Mixed, default: {} },
      createdAt: { type: String, required: true, index: true },
    },
    { versionKey: false },
  );
  return {
    ...createManagementModels(connection),
    ...createAdvancedModels(connection),
    SkillPassport: connection.model<SkillPassport>(
      "SkillPassport",
      passportSchema,
    ),
    AuditLog: connection.model<AuditLog>("AuditLog", auditSchema),
    User: connection.model<User>("User", userSchema),
    Profile: connection.model<Profile>("WorkerProfile", profileSchema),
    Qualification: connection.model<Qualification>(
      "Qualification",
      qualificationSchema,
    ),
    Assessment: connection.model<Assessment>("Assessment", assessmentSchema),
    Evidence: connection.model<
      Evidence & { imageData?: Buffer; mediaData?: Buffer; analysis?: unknown }
    >("Evidence", evidenceSchema),
  };
}
export async function connectDatabase(uri: string) {
  const connection = await mongoose
    .createConnection(uri, { serverSelectionTimeoutMS: 12000, autoIndex: true })
    .asPromise();
  const models = createModels(connection);
  await Promise.all(Object.values(models).map((model) => model.init()));
  // Idempotent migration preserves every existing Phase 1–5 response and score.
  await models.Assessment.updateMany(
    { version: { $exists: false } },
    { $set: { version: 0, evidenceIds: [], history: [] } },
  );
  return { connection, models };
}
export type Models = ReturnType<typeof createModels>;
