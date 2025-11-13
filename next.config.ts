import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Add response headers to prevent connection pooling and caching issues
  async headers() {
    return [
      {
        // Apply to remaining API routes (reminders, check-user)
        // Note: send-message now calls webhook directly from browser
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
        // Prevent aggressive HTML caching - allow browser to revalidate
        // This ensures auth state is properly restored on page refresh
        source: '/:path*',
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
