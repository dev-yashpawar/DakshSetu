import { registerManagementRoutes, getSettings } from "./management.js";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Models } from "./models.js";
import {
  extractSkills,
  emptyProfile,
  HttpError,
  publicUser,
  type AIConfig,
} from "./services.js";
import {
  portalLoginSchema,
  registerSchema,
  profileSchema,
  experienceSchema,
  skillsSchema,
  selfSchema,
} from "../../shared/validation.js";
import { matchSkills } from "../../shared/data.js";
import { questions } from "./questions.js";
import multer from "multer";
import { registerAssessorRoutes } from "./assessor.js";
import type { ImageStorage } from "./evidence.js";
import type { User, Profile } from "../../shared/types.js";
import { registerFeatureRoutes } from "./features.js";
import { audit } from "./audit.js";
import { registerMediaRoutes } from "./media.js";
import { registerPracticalRoutes } from "./practical.js";
import { registerVoiceRoutes } from "./voice.js";
import { workerAssessment } from "../../shared/practical.js";
import { registerCredentialRoutes } from "./credentials.js";
import { registerQualityRoutes } from "./quality.js";
import { registerReassessmentRoutes } from "./reassessment.js";
import { submitSelfAssessment, registerSyncRoutes } from "./sync.js";

declare global {
  namespace Express {
    interface Request {
      user: User;
    }
  }
}
type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;
const route =
  (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
export function createApp(
  db: Models,
  config: {
    jwtSecret: string;
    clientUrls: string[];
    ai: AIConfig;
    test?: boolean;
    imageStorage?: ImageStorage;
    trustProxy?: number;
    allowDemoLogin?: boolean;
    publicAppUrl?: string;
  },
) {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", config.trustProxy);
  // Evidence previews use authenticated API bytes converted to local object URLs.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          imgSrc: ["'self'", "data:", "blob:"],
          mediaSrc: ["'self'", "blob:"],
        },
      },
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, !origin || config.clientUrls.includes(origin));
      },
    }),
  );
  app.use("/api/admin/quality/datasets", express.json({ limit: "2mb" }));
  app.use(express.json({ limit: "64kb" }));
  app.use((req, res, next) => {
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      if (req.user?.role !== "worker") return json(body);
      const redact = (value: any): any => {
        if (Array.isArray(value)) return value.map(redact);
        if (!value || typeof value !== "object") return value;
        if ("selfAssessmentScore" in value && "workerId" in value && "evidenceIds" in value) return workerAssessment(value);
        const { analysis, ...safe } = value;
        if ("cloudinaryPublicId" in safe) { delete safe.url; delete safe.cloudinaryPublicId; }
        return Object.fromEntries(Object.entries(safe).map(([k, v]) => [k, k === "_id" ? v : redact(v)]));
      };
      return json(redact(JSON.parse(JSON.stringify(body))));
    };
    next();
  });
  if (!config.test)
    app.use(
      "/api",
      rateLimit({
        windowMs: 60000,
        limit: 180,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: { error: "Too many requests. Please try again shortly." },
      }),
    );
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    skip: () => !!config.test,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Too many sign-in attempts. Please try again in 15 minutes.",
    },
  });
  const token = (user: User) =>
    jwt.sign({ sub: user.id }, config.jwtSecret, {
      expiresIn: "12h",
      issuer: "dakshsetu",
      audience: "dakshsetu-web",
    });
  const requireAuth = route(async (req, _res, next) => {
    const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!bearer) throw new HttpError(401, "Please sign in to continue.");
    let id: string;
    try {
      const payload = jwt.verify(bearer, config.jwtSecret, {
        issuer: "dakshsetu",
        audience: "dakshsetu-web",
        algorithms: ["HS256"],
      });
      if (typeof payload === "string" || !payload.sub) throw Error();
      id = payload.sub;
    } catch {
      throw new HttpError(
        401,
        "Your session has expired. Please sign in again.",
      );
    }
    const user = await db.User.findOne({ id }).lean();
    if (!user) throw new HttpError(401, "Your account was not found.");
    if (user.accountStatus === "INACTIVE")
      throw new HttpError(
        401,
        "This account is inactive. Contact an administrator.",
      );
    req.user = user as User;
    next();
  });
  const worker = route(async (req, _res, next) => {
    if (req.user.role !== "worker")
      throw new HttpError(403, "This area is for workers.");
    next();
  });
  async function getProfile(userId: string) {
    const p = await db.Profile.findOne({ userId }).lean();
    if (!p) throw new HttpError(404, "Worker profile was not found.");
    return p as Profile;
  }
  async function updateProfile(p: Profile, changes: Partial<Profile>) {
    const updated = await db.Profile.findOneAndUpdate(
      { id: p.id, version: p.version },
      {
        $set: { ...changes, updatedAt: new Date().toISOString() },
        $inc: { version: 1 },
      },
      { new: true, runValidators: true },
    ).lean();
    if (!updated)
      throw new HttpError(
        409,
        "Your profile changed in another session. Reload before continuing.",
      );
    return updated;
  }
  const editable = (p: Profile) => {
    if (["SELF_ASSESSED", "IN_ASSESSMENT", "SIGNED_OFF"].includes(p.status))
      throw new HttpError(
        409,
        "This self-assessment is already submitted. Your saved result is available.",
      );
  };
  app.get(
    "/api/health",
    route(async (_req, res) =>
      res.status(db.User.db.readyState === 1 ? 200 : 503).json({
        status: db.User.db.readyState === 1 ? "ok" : "unavailable",
        database: db.User.db.readyState === 1 ? "connected" : "disconnected",
        storage: "MongoDB",
        aiConfigured: !!config.ai.apiKey,
        evidenceConfigured: !!config.imageStorage?.configured,
        scope: "Phases 1–14",
      }),
    ),
  );
  app.post(
    "/api/auth/register",
    authLimit,
    route(async (req, res) => {
      const input = registerSchema.strict().parse(req.body),
        now = new Date().toISOString();
      const user = {
        id: randomUUID(),
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash: await bcrypt.hash(input.password, 12),
        role: "worker" as const,
        preferredLanguage: input.preferredLanguage,
        createdAt: now,
        updatedAt: now,
      };
      await db.User.create(user);
      try {
        await db.Profile.create(emptyProfile(user.id));
      } catch (error) {
        await db.User.deleteOne({ id: user.id });
        throw error;
      }
      res.status(201).json({ user: publicUser(user), token: token(user) });
    }),
  );
  app.post(
    "/api/auth/digilocker/demo",
    authLimit,
    route(async (req, res) => {
      z.object({}).strict().parse(req.body);
      if (
        config.allowDemoLogin === false ||
        !(await getSettings(db)).demoEnabled
      )
        throw new HttpError(403, "Demo login is disabled.");
      const user = await db.User.findOne({
        email: "worker@dakshsetu.demo",
        role: "worker",
        accountStatus: { $ne: "INACTIVE" },
      }).lean();
      if (!user)
        throw new HttpError(503, "Demo worker account is unavailable.");
      res.json({
        user: publicUser(user as User),
        token: token(user as User),
        demo: true,
        identityVerified: false,
      });
    }),
  );
  app.post(
    "/api/auth/login",
    authLimit,
    route(async (req, res) => {
      const input = portalLoginSchema.strict().parse(req.body);
      const user = await db.User.findOne({ email: input.email })
        .select("+passwordHash")
        .lean();
      const valid = await bcrypt.compare(
        input.password,
        user?.passwordHash ??
          "$2b$12$BZZy4HBnpIQdiEMGHLRi7uR1dLHy7fdQ3Nya24/ys6cYbJkbWfTee",
      );
      if (!user || !valid || user.accountStatus === "INACTIVE")
        throw new HttpError(401, "Email or password is incorrect.");
      if (input.role && user.role !== input.role)
        throw new HttpError(401, "Use an account for the selected portal.");
      if (
        (config.allowDemoLogin === false ||
          !(await getSettings(db)).demoEnabled) &&
        [
          "worker@dakshsetu.demo",
          "assessor@dakshsetu.demo",
          "admin@dakshsetu.demo",
        ].includes(user.email)
      )
        throw new HttpError(401, "Email or password is incorrect.");
      res.json({ user: publicUser(user as User), token: token(user as User) });
    }),
  );
  app.get(
    "/api/auth/me",
    requireAuth,
    route(async (req, res) => res.json(publicUser(req.user))),
  );
  app.use("/api/workers", requireAuth, worker);
  app.get(
    "/api/workers/me",
    route(async (req, res) => {
      const profile = await getProfile(req.user.id);
      const assessment = await db.Assessment.findOne({
        workerId: req.user.id,
      }).lean();
      res.json({ profile, assessment, user: publicUser(req.user) });
    }),
  );
  app.put(
    "/api/workers/me",
    route(async (req, res) => {
      const { preferredLanguage, ...changes } = profileSchema.parse(req.body);
      const p = await getProfile(req.user.id),
        changingWork = Object.keys(changes).length > 0;
      if (changingWork) editable(p);
      let updated = p;
      if (changingWork) {
        const invalidated =
          changes.experienceDescription !== undefined &&
          changes.experienceDescription !== p.experienceDescription;
        const remap =
          invalidated ||
          (changes.yearsExperience !== undefined &&
            changes.yearsExperience !== p.yearsExperience);
        updated = (await updateProfile(p, {
          ...changes,
          ...(invalidated ? { detectedSkills: [], confirmedSkills: [] } : {}),
          ...(remap
            ? {
                status: "REGISTERED",
                selectedQualificationId: "",
                matchScore: 0,
              }
            : {}),
        })) as Profile;
      }
      if (preferredLanguage)
        await db.User.updateOne(
          { id: req.user.id },
          { $set: { preferredLanguage, updatedAt: new Date().toISOString() } },
        );
      res.json(updated);
    }),
  );
  app.post(
    "/api/workers/experience",
    route(async (req, res) => {
      const input = experienceSchema.strict().parse(req.body),
        p = await getProfile(req.user.id);
      editable(p);
      const same =
        input.experienceDescription === p.experienceDescription &&
        input.yearsExperience === p.yearsExperience;
      const updated = await updateProfile(p, {
        ...input,
        status: "DECLARED",
        ...(!same
          ? {
              detectedSkills: [],
              confirmedSkills: [],
              selectedQualificationId: "",
              matchScore: 0,
            }
          : {}),
      });
      if (input.declarationSource === "voice")
        await audit(db, {
          id: p.id + ":" + (p.version + 1) + ":voice",
          actorId: req.user.id,
          actorRole: "worker",
          action: "VOICE_TRANSCRIPT_SAVED",
          metadata: {
            language: req.user.preferredLanguage,
            characters: input.experienceDescription.length,
          },
        });
      res.json(updated);
    }),
  );
  app.put(
    "/api/workers/skills",
    route(async (req, res) => {
      const { skills } = skillsSchema.strict().parse(req.body),
        p = await getProfile(req.user.id);
      editable(p);
      if (p.experienceDescription.length < 15 || p.trade !== "Electrician")
        throw new HttpError(
          409,
          "Describe your electrical work before confirming skills.",
        );
      const updated = await updateProfile(p, {
        confirmedSkills: [...new Set(skills)],
        selectedQualificationId: "",
        matchScore: 0,
        status: "DECLARED",
      });
      await audit(db, {
        id: p.id + ":" + updated.version + ":skills",
        actorId: req.user.id,
        actorRole: "worker",
        action: "WORKER_SKILLS_CONFIRMED",
        metadata: { skillCount: skills.length },
      });
      res.json(updated);
    }),
  );
  app.post(
    "/api/ai/extract-skills",
    requireAuth,
    worker,
    route(async (req, res) => {
      const input = experienceSchema.strict().parse(req.body),
        p = await getProfile(req.user.id);
      editable(p);
      if (
        input.experienceDescription !== p.experienceDescription ||
        input.yearsExperience !== p.yearsExperience
      )
        throw new HttpError(409, "Save your experience before analysing it.");
      const result = await extractSkills(input, config.ai);
      await updateProfile(p, {
        detectedSkills: result.skills,
        confirmedSkills: [],
        selectedQualificationId: "",
        matchScore: 0,
        status: "DECLARED",
      });
      await audit(db, {
        id: randomUUID(),
        actorId: req.user.id,
        actorRole: "worker",
        action: "SKILLS_EXTRACTED",
        metadata: { skillCount: result.skills.length },
      });
      res.json(result);
    }),
  );
  app.get(
    "/api/qualifications",
    requireAuth,
    route(async (_req, res) => res.json(await db.Qualification.find().lean())),
  );
  app.post(
    "/api/qualifications/match",
    requireAuth,
    worker,
    route(async (req, res) => {
      const p = await getProfile(req.user.id);
      editable(p);
      if (!p.confirmedSkills.length)
        throw new HttpError(
          409,
          "Confirm at least one skill before finding a match.",
        );
      const stored = await db.Qualification.findOne({
        id: (await getSettings(db)).activeQualificationId,
        active: { $ne: false },
      }).lean();
      if (!stored)
        throw new HttpError(
          503,
          "Qualification data is unavailable. Run the seed command.",
        );
      const result = matchSkills(
        p.confirmedSkills,
        p.yearsExperience,
        p.experienceDescription,
        stored,
      );
      await updateProfile(p, {
        selectedQualificationId: stored.id,
        matchScore: result.matchScore,
        matchDetails: result,
        status: "MAPPED",
      });
      await audit(db, {
        id: randomUUID(),
        actorId: req.user.id,
        actorRole: "worker",
        action: "QUALIFICATION_MAPPED",
        metadata: { qualificationId: stored.id, matchScore: result.matchScore },
      });
      res.json({ ...result, qualification: stored });
    }),
  );
  app.get(
    "/api/qualifications/:id",
    requireAuth,
    route(async (req, res) => {
      const q = await db.Qualification.findOne({ id: req.params.id }).lean();
      if (!q) throw new HttpError(404, "Qualification not found.");
      res.json(q);
    }),
  );
  app.get(
    "/api/self-assessment/questions/:qualificationId",
    requireAuth,
    worker,
    route(async (req, res) => {
      const p = await getProfile(req.user.id);
      if (
        !p.selectedQualificationId ||
        p.selectedQualificationId !== req.params.qualificationId
      )
        throw new HttpError(409, "Confirm a qualification match first.");
      res.json(questions.map(({ correctAnswer, ...q }) => q));
    }),
  );
  app.post(
    "/api/self-assessment/submit",
    requireAuth,
    worker,
    route(async (req, res) => {
      const result = await submitSelfAssessment(db, req.user.id, req.body);
      res.status(result.created ? 201 : 200).json(result.assessment);
    }),
  );
  registerAssessorRoutes(app, db, requireAuth, config.ai, config.imageStorage);
  registerFeatureRoutes(app, db, requireAuth);
  registerManagementRoutes(app, db, requireAuth, config.allowDemoLogin !== false);
  registerSyncRoutes(app, db, requireAuth);
  registerMediaRoutes(app, db, requireAuth, config.imageStorage, config.ai);
  registerPracticalRoutes(app, db, requireAuth, config.ai, config.test);
  registerVoiceRoutes(app, requireAuth, config.ai, config.test);
  registerCredentialRoutes(app, db, requireAuth, config);
  registerQualityRoutes(app, db, requireAuth);
  registerReassessmentRoutes(app, db, requireAuth, config.imageStorage);
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "This endpoint is not available." }),
  );
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof z.ZodError)
        return res
          .status(400)
          .json({ error: error.issues.map((i) => i.message).join(". ") });
      if (error instanceof HttpError)
        return res
          .status(error.status)
          .json({ error: error.message, code: error.code });
      if (error instanceof multer.MulterError)
        return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
          error:
            error.code === "LIMIT_FILE_SIZE"
              ? "Choose an image smaller than 5 MB."
              : "Upload one image and try again.",
        });
      if ((error as { code?: number })?.code === 11000)
        return res
          .status(409)
          .json({ error: "An account with this email already exists." });
      if (error instanceof SyntaxError)
        return res.status(400).json({ error: "Invalid JSON request." });
      console.error(
        "Request failed:",
        error instanceof Error ? error.name : "UnknownError",
      );
      res
        .status(500)
        .json({ error: "Something went wrong. Please try again." });
    },
  );
  return app;
}
