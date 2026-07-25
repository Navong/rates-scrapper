// Runs once when the Node server boots. This is where the background warmer is
// started — the persistent process is what makes the SWR cache + GME rate
// spreading work (the reason this app is `next start`, not serverless).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initCacheFromRedis, startWarmer } = await import("./lib/cache");
    const { initManual } = await import("./lib/manual");
    const { initFees } = await import("./lib/fees");
    // Hydrate the shared stores from Redis (+ subscribe to cross-instance edits)
    // before serving, so the sync getters return the shared source of truth.
    await Promise.all([initCacheFromRedis(), initManual(), initFees()]);
    startWarmer();
  }
}
