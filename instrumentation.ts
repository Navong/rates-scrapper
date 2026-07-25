// Runs once when the Node server boots. This is where the background warmer is
// started — the persistent process is what makes the SWR cache + GME rate
// spreading work (the reason this app is `next start`, not serverless).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initCacheFromRedis, startWarmer } = await import("./lib/cache");
    await initCacheFromRedis(); // warm from the shared Redis copy before serving
    startWarmer();
  }
}
