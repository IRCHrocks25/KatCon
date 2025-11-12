import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

/**
 * Keep-warm endpoint to prevent serverless cold starts
 * This endpoint is pinged every 4 minutes by Vercel Cron
 * to keep the serverless functions warm and responsive
 */
export async function GET() {
  return NextResponse.json({ 
    status: 'warm', 
    timestamp: Date.now(),
    message: 'Function is warm and ready'
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    }
  });
}

