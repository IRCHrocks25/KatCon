import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Add response headers to prevent connection pooling issues
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
    ];
  },
};

export default nextConfig;
