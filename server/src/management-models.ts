import { Schema, type Connection } from "mongoose";
import type {
  SystemSettings,
  QualificationRevision,
  SyncTelemetry,
} from "../../shared/management.js";
export function createManagementModels(c: Connection) {
  return {
    ManagementLock: c.model(
      "ManagementLock",
      new Schema(
        { id: { type: String, unique: true }, leaseUntil: Date, token: String },
        { versionKey: false },
      ),
    ),
    SystemSettings: c.model<SystemSettings>(
      "SystemSettings",
      new Schema(
        {
          id: { type: String, unique: true },
          version: Number,
          languages: [String],
          demoEnabled: Boolean,
          activeQualificationId: String,
          policy: Schema.Types.Mixed,
          updatedAt: String,
        },
        { versionKey: false },
      ),
    ),
    QualificationRevision: c.model<QualificationRevision>(
      "QualificationRevision",
      new Schema(
        {
          id: { type: String, unique: true },
          qualificationId: { type: String, index: true },
          version: Number,
          taskTitle: String,
          criteria: [
            {
              _id: false,
              id: String,
              criterion: String,
              section: String,
              weight: Number,
              mandatory: Boolean,
            },
          ],
          createdAt: String,
          createdBy: String,
        },
        { versionKey: false },
      ).index({ qualificationId: 1, version: 1 }, { unique: true }),
    ),
    SyncTelemetry: c.model<SyncTelemetry>(
      "SyncTelemetry",
      new Schema(
        {
          id: { type: String, unique: true },
          actorId: { type: String, index: true },
          deviceId: String,
          pending: Number,
          failed: Number,
          conflicts: Number,
          drafts: Number,
          lastSeenAt: String,
          retryRequestedAt: String,
        },
        { versionKey: false },
      ),
    ),
  };
}
