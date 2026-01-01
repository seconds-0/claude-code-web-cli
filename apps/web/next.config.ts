import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@ccc/api-contract"],
  output: "standalone",
};

export default nextConfig;
