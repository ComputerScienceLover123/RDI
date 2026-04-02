import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  SESSION_COOKIE_NAME: z.string().min(1),
  MFA_PENDING_COOKIE_NAME: z.string().min(1),
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  JWT_SESSION_TTL_SECONDS: z.string().transform((v) => Number(v)).pipe(z.number().positive()),
  JWT_MFA_PENDING_TTL_SECONDS: z
    .string()
    .transform((v) => Number(v))
    .pipe(z.number().positive()),
  BCRYPT_SALT_ROUNDS: z.string().transform((v) => Number(v)).pipe(z.number().min(12)),
  APP_BASE_URL: z.string().min(1).optional()
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);

