import { NextRequest, NextResponse } from 'next/server';

// In-memory store for rate limiting (in production, use Redis)
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  max: number; // Maximum requests per window
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export function rateLimit(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message = 'Too many requests, please try again later.',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  return function rateLimitWrapper(
    handler: (request: NextRequest, ...args: any[]) => Promise<NextResponse>
  ) {
    return async function rateLimitedHandler(
      request: NextRequest,
      ...args: any[]
    ): Promise<NextResponse> {
      // Get client IP (fallback to a default for development)
      const ip = request.headers.get('x-forwarded-for') ||
                 request.headers.get('x-real-ip') ||
                 '127.0.0.1';

      const key = `${ip}:${request.nextUrl.pathname}`;
      const now = Date.now();

      // Get or create rate limit entry
      let entry = rateLimitStore.get(key);
      if (!entry || now > entry.resetTime) {
        entry = {
          count: 0,
          resetTime: now + windowMs,
        };
      }

      // Check if limit exceeded
      if (entry.count >= max) {
        const resetIn = Math.ceil((entry.resetTime - now) / 1000);
        return NextResponse.json(
          {
            error: message,
            retryAfter: resetIn,
          },
          {
            status: 429,
            headers: {
              'Retry-After': resetIn.toString(),
              'X-RateLimit-Limit': max.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': entry.resetTime.toString(),
            },
          }
        );
      }

      // Increment counter
      entry.count++;
      rateLimitStore.set(key, entry);

      try {
        // Execute the handler
        const response = await handler(request, ...args);

        // Skip incrementing for successful requests if configured
        if (skipSuccessfulRequests && response.status < 400) {
          entry.count--; // Decrement since we don't want to count successful requests
          if (entry.count <= 0) {
            rateLimitStore.delete(key);
          } else {
            rateLimitStore.set(key, entry);
          }
        }

        // Add rate limit headers to response
        const remaining = Math.max(0, max - entry.count);

        response.headers.set('X-RateLimit-Limit', max.toString());
        response.headers.set('X-RateLimit-Remaining', remaining.toString());
        response.headers.set('X-RateLimit-Reset', entry.resetTime.toString());

        return response;
      } catch (error) {
        // Skip incrementing for failed requests if configured
        if (skipFailedRequests) {
          entry.count--;
          if (entry.count <= 0) {
            rateLimitStore.delete(key);
          } else {
            rateLimitStore.set(key, entry);
          }
        }
        throw error;
      }
    };
  };
}

// Pre-configured rate limiters for different use cases
export const strictRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'Too many requests. Please slow down.',
});

export const moderateRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: 'Rate limit exceeded. Please try again later.',
});

export const lenientRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute
  message: 'Too many requests. Please wait before trying again.',
});

export const fileUploadRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 file uploads per minute
  message: 'File upload limit exceeded. Please try again later.',
});

export const realtimeRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // 300 real-time operations per minute
  message: 'Real-time operation limit exceeded.',
  skipSuccessfulRequests: true, // Don't count successful real-time ops
});

// Cleanup old entries periodically (in production, this would be handled by Redis TTL)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean up every minute
