/** @type {import('next').NextConfig} */
const nextConfig = {
  // The legacy HTML renderers (theme.mjs + the render halves of ranking.mjs) and
  // the standalone Office Scripts (integrations/office-scripts/*.ts) live beside
  // the app but aren't part of the build graph. Skip type/lint gating so a stray
  // legacy file can never fail `next build`.
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
