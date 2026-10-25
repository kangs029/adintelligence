import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Protected local assets must be fetched by the authenticated browser.
    // The server-side image optimizer cannot forward the visitor's gate cookie.
    unoptimized: true,
  },
  // Bake env vars into the build so they are available in Edge Runtime (middleware)
  // and SSR API routes on Amplify where process.env injection is unreliable.
  env: {
    XPAT_ACCESS_PASSWORD: process.env.XPAT_ACCESS_PASSWORD ?? "",
    METABASE_URL: process.env.METABASE_URL ?? "",
    METABASE_API_KEY: process.env.METABASE_API_KEY ?? "",
  },
};

export default nextConfig;
