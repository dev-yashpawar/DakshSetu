import { z } from "zod";
import { rubric, recommendations } from "./assessment.js";
export const languageSchema = z.enum(["en", "hi", "mr"]);
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z
    .string()
    .min(6)
    .max(72)
    .refine(
      (value) => new TextEncoder().encode(value).length <= 72,
      "Password must fit within 72 UTF-8 bytes",
    ),
});
export const registerSchema = loginSchema.extend({
  name: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .regex(
      /^(\+91)?[6-9]\d{9}$/,
      "Enter a valid 10-digit Indian mobile number",
    ),
  preferredLanguage: languageSchema.default("en"),
});
export const portalLoginSchema = loginSchema.extend({
  role: z.enum(["worker", "assessor", "admin"]).optional(),
});
export const profileSchema = z
  .object({
    state: z.string().max(80).optional(),
    district: z.string().max(80).optional(),
    trade: z.literal("Electrician").optional(),
    yearsExperience: z.number().min(0).max(70).optional(),
    experienceDescription: z.string().trim().max(4000).optional(),
    preferredLanguage: languageSchema.optional(),
  })
  .strict();
export const experienceSchema = z.object({
  declarationSource:z.enum(['text','voice']).optional(),
  experienceDescription: z
    .string()
    .trim()
    .min(15, "Describe your work in at least 15 characters")
    .max(4000),
  trade: z.literal("Electrician"),
  yearsExperience: z.number().min(0).max(70),
});
export const skillsSchema = z.object({
  skills: z.array(z.string().trim().min(2).max(80)).min(1).max(20),
});
export const selfSchema = z.object({
  profileVersion: z.number().int().nonnegative().optional(),
  qualificationId: z.string().max(100).optional(),
  responses: z
    .array(
      z.object({
        questionId: z.string(),
        answer: z.number().int().min(0).max(3),
      }),
    )
    .length(5),
});
export const practicalSchema = z
  .object({
    baseVersion: z.number().int().nonnegative(),
    clientMutationId: z.string().uuid().optional(),
    rubricScores: z
      .array(
        z
          .object({
            criterionId: z.enum(
              rubric.map((r) => r.id) as [string, ...string[]],
            ),
            score: z.number().int().min(0).max(3),
            remark: z.string().trim().max(500).default(""),
            evidenceIds:z.array(z.string().uuid()).max(6).default([]),
          })
          .strict(),
      )
      .max(rubric.length),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      new Set(data.rubricScores.map((r) => r.criterionId)).size !==
      data.rubricScores.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Each rubric criterion can be scored only once.",
      });
  });
export const finalizeSchema = z
  .object({
    baseVersion: z.number().int().nonnegative(),
    assessorScore: z.number().int().min(0).max(100),
    recommendation: z.enum(recommendations),
    overrideReason: z.string().trim().max(2000).default(""),
    confirmed: z.literal(true),
  })
  .strict();
export const observationInputSchema = z
  .object({
    assessmentId: z.string().uuid(),
    evidenceId: z.string().uuid(),
    baseVersion: z.number().int().nonnegative(),
  })
  .strict();
