import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { connectDatabase } from "./models.js";
const input = z
  .object({
    BOOTSTRAP_EMAIL: z.string().email(),
    BOOTSTRAP_PASSWORD: z
      .string()
      .min(12)
      .max(72)
      .refine((v) => Buffer.byteLength(v, "utf8") <= 72),
    BOOTSTRAP_ROLE: z.enum(["admin", "assessor"]),
    BOOTSTRAP_NAME: z.string().min(2).max(80),
    BOOTSTRAP_PHONE: z.string().regex(/^(\+91)?[6-9]\d{9}$/),
    MONGODB_URI: z.string().min(1),
  })
  .parse(process.env);
const { connection, models } = await connectDatabase(input.MONGODB_URI);
try {
  if (await models.User.exists({ email: input.BOOTSTRAP_EMAIL.toLowerCase() }))
    throw Error(
      "This account already exists. No account or password was changed.",
    );
  const now = new Date().toISOString();
  await models.User.create({
    id: randomUUID(),
    name: input.BOOTSTRAP_NAME,
    email: input.BOOTSTRAP_EMAIL.toLowerCase(),
    phone: input.BOOTSTRAP_PHONE,
    passwordHash: await bcrypt.hash(input.BOOTSTRAP_PASSWORD, 12),
    role: input.BOOTSTRAP_ROLE,
    preferredLanguage: "en",
    createdAt: now,
    updatedAt: now,
  });
  console.log("Privileged account created. No credentials were printed.");
} finally {
  await connection.close();
}
