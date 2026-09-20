import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel supplies its own output adapter. With Next 16.3 + Turbopack,
  // combining that adapter with `standalone` makes the build look for a
  // server trace that Turbopack does not emit at this path. Docker still uses
  // the standalone server, so keep it for non-Vercel builds.
  output: process.env.VERCEL ? undefined : "standalone",
  typescript: {
    ignoreBuildErrors: process.env.SKIP_TYPECHECK === "true",
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },
  experimental: {
    turbopackFileSystemCacheForDev: true,
    turbopackFileSystemCacheForBuild: true,
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
