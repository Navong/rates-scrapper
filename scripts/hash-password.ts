// Generate the admin credential env values. The plaintext password is never
// stored — only a scrypt hash. Run:
//   node scripts/hash-password.mjs "your-strong-password"
// then paste the printed lines into .env / docker-compose environment.
import { scryptSync, randomBytes } from "node:crypto";

const pw = process.argv[2];
if (!pw) {
  console.error('Usage: node scripts/hash-password.mjs "<password>"');
  process.exit(1);
}
if (pw.length < 8) console.error("(warning: consider a longer password)\n");

const salt = randomBytes(16).toString("hex");
const hash = scryptSync(pw, salt, 32).toString("hex");

console.log("ADMIN_PASSWORD_HASH=" + salt + ":" + hash);
console.log("ADMIN_TOKEN=" + randomBytes(24).toString("hex"));
