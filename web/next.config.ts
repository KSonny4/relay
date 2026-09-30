import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // The dev server is opened at 127.0.0.1. Without this, Next blocks the
  // client bundle and clicks on the page do nothing.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
