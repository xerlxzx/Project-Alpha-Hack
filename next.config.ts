import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the on-screen dev indicator (the bottom-left Next.js "N" badge),
  // which was overlapping the sheet's primary CTA in development.
  devIndicators: false,
};

export default nextConfig;
