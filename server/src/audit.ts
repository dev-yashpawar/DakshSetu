import type { Models } from "./models.js";
import type { AuditLog } from "../../shared/types.js";
export async function audit(
  db: Models,
  entry: Omit<AuditLog, "createdAt" | "metadata"> & {
    metadata?: AuditLog["metadata"];
  },
) {
  await db.AuditLog.updateOne(
    { id: entry.id },
    {
      $setOnInsert: {
        ...entry,
        metadata: entry.metadata ?? {},
        createdAt: new Date().toISOString(),
      },
    },
    { upsert: true, runValidators: true },
  );
  const aliases: Record<string, string> = {
    WORKER_SKILLS_CONFIRMED: "SKILLS_CONFIRMED",
    ASSESSOR_SCORE_CHANGED: "PRACTICAL_SCORE_SAVED",
    EVIDENCE_UPLOADED: "IMAGE_EVIDENCE_UPLOADED",
    AI_EVIDENCE_ANALYZED: "AI_IMAGE_ANALYSIS_COMPLETED",
    AI_SCORE_OVERRIDDEN: "ASSESSOR_SCORE_OVERRIDDEN",
  };
  if (aliases[entry.action])
    await db.AuditLog.updateOne(
      { id: entry.id + ":advanced" },
      {
        $setOnInsert: {
          ...entry,
          id: entry.id + ":advanced",
          action: aliases[entry.action],
          metadata: entry.metadata ?? {},
          createdAt: new Date().toISOString(),
        },
      },
      { upsert: true, runValidators: true },
    );
}
