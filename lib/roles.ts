// Role derived from a session/credential value. The cookie stores an opaque
// secret; the role is *which* secret it matches — so a viewer can't forge admin
// (they never learn ADMIN_TOKEN). Reads env at call time and is pure (no node
// imports), so it works in the Edge middleware AND in server components.
export function roleFromValue(v) {
  if (!v) return null;
  const admin = process.env.ADMIN_TOKEN || "";
  const password = process.env.ACCESS_PASSWORD || "gme";
  const token = process.env.RATES_TOKEN || "";
  if (admin && v === admin) return "admin";
  if (v === password || (token && v === token)) return "user";
  return null;
}
