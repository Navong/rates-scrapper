// Admin password verification (Node runtime only — used by the login route).
// The admin password is stored as a scrypt hash "saltHex:hashHex"; we recompute
// and compare in constant time. No plaintext, no external hashing dependency.
import { scryptSync, timingSafeEqual } from "node:crypto";

export function verifyAdmin(username, password) {
  const user = process.env.ADMIN_USER || "";
  const stored = process.env.ADMIN_PASSWORD_HASH || "";
  if (!user || !stored || username !== user) return false;
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export const adminToken = () => process.env.ADMIN_TOKEN || "";
