import type { NextConfig } from "next";

const basePath = process.env.EMBERTOP_BASE_PATH?.trim() || "";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath,
  // Nothing here goes through next/image, and leaving the optimizer enabled
  // traces sharp — and with it LGPL-3.0 libvips — into the standalone output
  // and the container image. Turning it off keeps the shipped artifact free
  // of copyleft components we do not use.
  images: { unoptimized: true },
  // Matched anywhere in the tree on purpose: a pnpm or Yarn install stores
  // these under paths like `node_modules/.pnpm/@img+sharp-libvips-…`, which a
  // `node_modules/@img/**` pattern silently fails to exclude.
  outputFileTracingExcludes: {
    "*": [
      "**/sharp/**",
      "**/@img/**",
      "**/*sharp*/**",
      "**/*libvips*/**",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Referrer-Policy",
            value: "same-origin",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
