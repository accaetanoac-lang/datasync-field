/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: process.env.NEXT_EXPORT === '1' ? 'export' : undefined,
  images: { unoptimized: true },
  // Leaflet requires this to avoid SSR issues
  transpilePackages: ['react-leaflet'],
};

module.exports = nextConfig;
