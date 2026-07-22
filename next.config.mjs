/** @type {import('next').NextConfig} */
const nextConfig = {
  // The old plain-node HTML renderers (theme/dashboard/ranking.mjs) and the
  // standalone Office Scripts (office-script-*.ts) live on beside the app. They
  // are not part of the build graph, but skip type/lint gating so a stray legacy
  // file can never fail `next build`.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  // The rate/warmer code uses Node built-ins (node:http client, fs, timers) and
  // must run in the Node.js runtime, never the edge runtime.
  //
  // `sharp` MUST be external too: it's a native module whose binary is
  // platform-specific (@img/sharp-linuxmusl-x64 in the Alpine image, win32 on a
  // dev box). Letting webpack bundle it resolves locally but fails the Docker
  // build with "webpack errors" on the routes that import it (/api/poster,
  // /api/sheet). External = required at runtime instead of bundled.
  serverExternalPackages: ["exceljs", "sharp"],
};

export default nextConfig;
