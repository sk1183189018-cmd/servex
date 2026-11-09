import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @servex/shared is a compiled workspace package (dist); transpiling keeps dev HMR working.
  transpilePackages: ["@servex/shared"],
  poweredByHeader: false,
};

export default nextConfig;
