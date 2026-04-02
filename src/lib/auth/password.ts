import bcrypt from "bcrypt";
import { env } from "../env";

export async function hashPassword(plain: string) {
  const saltRounds = env.BCRYPT_SALT_ROUNDS as unknown as number;
  return bcrypt.hash(plain, saltRounds);
}

export async function verifyPassword(plain: string, passwordHash: string) {
  return bcrypt.compare(plain, passwordHash);
}

