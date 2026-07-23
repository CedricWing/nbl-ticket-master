import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is what the Docker runner stage copies — it traces only the deps this
  // app actually needs instead of shipping the whole pnpm workspace's node_modules.
  output: 'standalone',
};

export default nextConfig;
