import { hash, compare, genSalt } from "bcryptjs";

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<{ hash: string; salt: string }> {
  const salt = await genSalt(BCRYPT_COST);
  const passwordHash = await hash(plain, salt);
  return { hash: passwordHash, salt };
}

export async function verifyPassword(plain: string, storedHash: string): Promise<boolean> {
  return compare(plain, storedHash);
}
