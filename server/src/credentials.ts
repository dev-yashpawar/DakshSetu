import { createHash, randomUUID } from "node:crypto";
import type { Express, Request, Response, RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { Models } from "./models.js";
import type { SkillPassport } from "../../shared/types.js";
import type { Credential, Reassessment } from "../../shared/advanced.js";
import { ensurePassport } from "./features.js";
import { HttpError } from "./services.js";
import { audit } from "./audit.js";
import { passportPdf } from "./passport-pdf.js";
const route =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    void fn(req, res).catch(next);
  };
const credentialId = z.string().regex(/^DS-RPL-\d{4}-[A-F0-9]{32}$/);
export function publicOrigin(raw?: string) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      !["", "/"].includes(u.pathname) ||
      (u.protocol !== "https:" &&
        !(
          u.protocol === "http:" &&
          ["127.0.0.1", "localhost"].includes(u.hostname)
        ))
    )
      return null;
    return u.origin;
  } catch {
    return null;
  }
}
export function passportCompetencies(
  p: SkillPassport,
  history: Reassessment[] = [],
) {
  const base = [
    ...p.competencyScores.map((c, i) => ({
      key: "knowledge:" + i,
      name: c.name,
      score: c.score,
      source: "self-assessment",
    })),
    ...p.practicalCriteria.map((c, i) => ({
      key: "practical:" + i,
      name: c.criterion,
      score: Math.round((c.score / c.maxScore) * 100),
      source: "practical",
    })),
  ];
  for (const h of history) {
    const c = base.find((c) => c.key === h.competencyKey);
    if (c && h.newScore !== undefined) {
      c.score = h.newScore;
      c.source = "reassessment";
    }
  }
  return base;
}
async function completed(db: Models, assessmentId: string) {
  return db.Reassessment.find({
    originalAssessmentId: assessmentId,
    status: "COMPLETED",
  })
    .sort({ completedAt: 1, id: 1 })
    .lean();
}
export function credentialHash(
  c: Credential,
  p: SkillPassport,
  history: Reassessment[],
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        credentialId: c.credentialId,
        workerId: p.workerId,
        assessmentId: p.assessmentId,
        finalScore: p.overallScore,
        issuedAt: c.issuedAt,
        revision: c.revision,
        status: c.status,
        revokedAt: c.revokedAt ?? "",
        workerName: p.workerName,
        trade: p.trade,
        qualification: p.qualificationCode,
        assessmentDate: p.signedOffAt,
        ...(c.hashVersion === 2
          ? {
              originalSelf: p.selfAssessmentScore,
              originalPractical: p.practicalScore,
              recommendation: p.recommendation,
              assessor: p.assessorId,
            }
          : {}),
        competencies: passportCompetencies(p, history),
        history: history.map((h) => ({
          id: h.id,
          key: h.competencyKey,
          previous: h.previousScore,
          next: h.newScore,
          assessor: h.assessorId,
          completed: h.completedAt,
          ...(c.hashVersion === 2
            ? { evidenceIds: h.evidenceIds, remark: h.remark }
            : {}),
        })),
      }),
    )
    .digest("hex");
}
export async function ensureCredential(db: Models, p: SkillPassport) {
  let credential = await db.Credential.findOne({
    assessmentId: p.assessmentId,
  }).lean();
  if (!credential) {
    const c: Credential = {
      hashVersion: 2,
      credentialId: `DS-RPL-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-", "").toUpperCase()}`,
      workerId: p.workerId,
      assessmentId: p.assessmentId,
      passportId: p.id,
      status: "ACTIVE",
      verificationHash: "",
      issuedAt: new Date().toISOString(),
      revision: 1,
      historyIds: [],
    };
    c.verificationHash = credentialHash(c, p, []);
    try {
      credential = (await db.Credential.findOneAndUpdate(
        { assessmentId: p.assessmentId },
        { $setOnInsert: c },
        { upsert: true, new: true, runValidators: true },
      ).lean())!;
    } catch (error) {
      credential = await db.Credential.findOne({
        assessmentId: p.assessmentId,
      }).lean();
      if (!credential) throw error;
    }
  }
  return credential;
}
export async function reconcileCredential(db: Models, p: SkillPassport) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const c = await ensureCredential(db, p),
      all = await completed(db, p.assessmentId),
      published = all.filter((h) => c.historyIds.includes(h.id));
    if (
      published.length !== c.historyIds.length ||
      credentialHash(c, p, published) !== c.verificationHash
    )
      throw new HttpError(
        409,
        "The credential integrity check failed. Contact an administrator.",
      );
    if (all.length === c.historyIds.length)
      return { credential: c, history: published };
    const next = {
      ...c,
      revision: all.length + 1,
      historyIds: all.map((h) => h.id),
      status:
        c.status === "REVOKED" ? ("REVOKED" as const) : ("UPDATED" as const),
    };
    next.verificationHash = credentialHash(next, p, all);
    const changed = await db.Credential.findOneAndUpdate(
      {
        credentialId: c.credentialId,
        revision: c.revision,
        verificationHash: c.verificationHash,
      },
      {
        $set: {
          revision: next.revision,
          historyIds: next.historyIds,
          status: next.status,
          verificationHash: next.verificationHash,
        },
      },
      { new: true, runValidators: true },
    ).lean();
    if (changed) return { credential: changed, history: all };
  }
  throw new HttpError(409, "The credential changed. Reload before continuing.");
}
export async function authorizedPassport(
  db: Models,
  req: Request,
  key: string,
) {
  const a = await db.Assessment.findOne({
    id: z.string().uuid().parse(key),
  }).lean();
  if (!a) throw new HttpError(404, "Assessment not found.");
  if (
    !(req.user.role === "worker" && a.workerId === req.user.id) &&
    !(req.user.role === "assessor" && a.assessorId === req.user.id) &&
    req.user.role !== "admin"
  )
    throw new HttpError(403, "This passport belongs to another assessment.");
  return { assessment: a, passport: await ensurePassport(db, a) };
}
export function registerCredentialRoutes(
  app: Express,
  db: Models,
  auth: RequestHandler,
  config: { publicAppUrl?: string; test?: boolean },
) {
  const origin = publicOrigin(config.publicAppUrl);
  app.get(
    "/api/credentials/assessment/:id",
    auth,
    route(async (req, res) => {
      const { passport: p } = await authorizedPassport(db, req, req.params.id),
        { credential: c, history } = await reconcileCredential(db, p),
        path = "/verify/" + c.credentialId;
      res
        .set("Cache-Control", "private, no-store")
        .json({
          credentialId: c.credentialId,
          status: c.status,
          issuedAt: c.issuedAt,
          revision: c.revision,
          verificationPath: path,
          verificationUrl: origin ? origin + path : null,
          history,
          competencies: passportCompetencies(p, history),
        });
    }),
  );
  const verificationLimit = rateLimit({
    windowMs: 60000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => !!config.test,
    message: { error: "Too many verification requests. Try again shortly." },
  });
  app.get(
    "/api/credentials/:credentialId/verify",
    verificationLimit,
    route(async (req, res) => {
      const parsed = credentialId.safeParse(req.params.credentialId);
      res.set("Cache-Control", "no-store");
      if (!parsed.success) return res.status(404).json({ status: "NOT_FOUND" });
      const c = await db.Credential.findOne({
        credentialId: parsed.data,
      }).lean();
      if (!c) return res.status(404).json({ status: "NOT_FOUND" });
      const [p, a, all] = await Promise.all([
          db.SkillPassport.findOne({ id: c.passportId }).lean(),
          db.Assessment.findOne({
            id: c.assessmentId,
            status: "SIGNED_OFF",
          }).lean(),
          completed(db, c.assessmentId),
        ]),
        history = all.filter((h) => c.historyIds.includes(h.id));
      if (
        !p ||
        !a ||
        a.finalScore !== p.overallScore ||
        a.workerId !== p.workerId ||
        a.assessorId !== p.assessorId ||
        history.length !== c.historyIds.length ||
        credentialHash(c, p, history) !== c.verificationHash
      )
        return res.status(404).json({ status: "NOT_FOUND" });
      await audit(db, {
        id: randomUUID(),
        actorId: "public-verifier",
        actorRole: "public",
        assessmentId: c.assessmentId,
        action: "CREDENTIAL_VERIFIED",
        metadata: { credentialId: c.credentialId, status: c.status },
      });
      res.json({
        credentialId: c.credentialId,
        status: c.status === "REVOKED" ? "REVOKED" : "VALID",
        revision: c.revision,
        workerName: p.workerName,
        trade: p.trade,
        assessmentDate: p.signedOffAt,
        overallScore: c.status === "REVOKED" ? undefined : p.overallScore,
        verifiedCompetencies:
          c.status === "REVOKED"
            ? []
            : passportCompetencies(p, history)
                .filter((s) => s.score >= 75)
                .map(({ name, score, source }) => ({ name, score, source })),
        prototype: true,
      });
    }),
  );
  app.get(
    "/api/passports/:id/pdf",
    auth,
    route(async (req, res) => {
      const { passport: p } = await authorizedPassport(db, req, req.params.id),
        { credential: c, history } = await reconcileCredential(db, p);
      if (!origin)
        throw new HttpError(
          503,
          "PDF generation is unavailable. Use Print / Save PDF instead.",
        );
      const pdf = await passportPdf(
        p,
        c,
        history,
        origin + "/verify/" + c.credentialId,
      );
      res
        .set({
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="dakshsetu-${c.credentialId}.pdf"`,
          "Cache-Control": "private, no-store",
        })
        .send(pdf);
    }),
  );
  app.post(
    "/api/admin/credentials/:credentialId/revoke",
    auth,
    route(async (req, res) => {
      if (req.user.role !== "admin")
        throw new HttpError(403, "This area is for administrators.");
      const key = credentialId.parse(req.params.credentialId),
        input = z
          .object({
            revision: z.number().int().positive(),
            reason: z.string().trim().min(10).max(1000),
          })
          .strict()
          .parse(req.body),
        c = await db.Credential.findOne({ credentialId: key }).lean();
      if (!c) throw new HttpError(404, "Credential not found.");
      if (c.status === "REVOKED") return res.json({ status: "REVOKED" });
      if (c.revision !== input.revision)
        throw new HttpError(
          409,
          "The credential changed. Reload before continuing.",
        );
      const p = await db.SkillPassport.findOne({ id: c.passportId }).lean();
      if (!p) throw new HttpError(404, "Credential not found.");
      const history = (await completed(db, c.assessmentId)).filter((h) =>
        c.historyIds.includes(h.id),
      );
      if (
        history.length !== c.historyIds.length ||
        credentialHash(c, p, history) !== c.verificationHash
      )
        throw new HttpError(
          409,
          "The credential integrity check failed. Contact an administrator.",
        );
      const next = {
        ...c,
        status: "REVOKED" as const,
        revokedAt: new Date().toISOString(),
        revokedBy: req.user.id,
        revocationReason: input.reason,
      };
      next.verificationHash = credentialHash(next, p, history);
      const changed = await db.Credential.findOneAndUpdate(
        { credentialId: key, revision: c.revision, status: { $ne: "REVOKED" } },
        {
          $set: {
            status: next.status,
            revokedAt: next.revokedAt,
            revokedBy: next.revokedBy,
            revocationReason: next.revocationReason,
            verificationHash: next.verificationHash,
          },
        },
        { new: true, runValidators: true },
      ).lean();
      if (!changed)
        throw new HttpError(
          409,
          "The credential changed. Reload before continuing.",
        );
      await audit(db, {
        id: key + ":revoked",
        actorId: req.user.id,
        actorRole: "admin",
        assessmentId: c.assessmentId,
        action: "CREDENTIAL_REVOKED",
        metadata: { reason: input.reason, credentialId: key },
      });
      res.json({ status: "REVOKED" });
    }),
  );
}
