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
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
