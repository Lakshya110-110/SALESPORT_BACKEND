/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Lint on CI via `npm run lint`. Don't block dev builds.
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
