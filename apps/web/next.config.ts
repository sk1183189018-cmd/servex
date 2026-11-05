import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @servex/shared ships TypeScript source, so Next needs to compile it.
  transpilePackages: ["@servex/shared"],
  poweredByHeader: false,
};

export default nextConfig;
