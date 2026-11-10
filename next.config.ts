import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Isolate browser-test output from a developer's running server.
  distDir: process.env.MATRIX_TEST_DIST_DIR || ".next",
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        // Keep native class scoping and exports for CSS Modules.
        condition: { not: { path: /\.module\.css$/ } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
