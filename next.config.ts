import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Add response headers to prevent connection pooling and caching issues
  async headers() {
    return [
      {
        // Apply to all API routes
        source: '/api/:path*',
        headers: [
          {
            key: 'Connection',
            value: 'close',
          },
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
        ],
      },
      {
        // Prevent aggressive caching of HTML pages (but allow asset caching)
        source: '/',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
