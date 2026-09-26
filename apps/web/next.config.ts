import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // packages/shared ships TypeScript source, not a build
  transpilePackages: ["@lifelog/shared"],
};

export default nextConfig;
