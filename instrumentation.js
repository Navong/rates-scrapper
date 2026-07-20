// Runs once when the Node server boots. This is where the background warmer is
// started — the persistent process is what makes the SWR cache + GME rate
// spreading work (the reason this app is `next start`, not serverless).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWarmer } = await import("./lib/cache.mjs");
    startWarmer();
  }
}
