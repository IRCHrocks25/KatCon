// Robust fetch wrapper with connection management and retry logic
// Fixes stale connection issues where requests stop working after ~5 minutes
// Prevents HTTP connection pooling issues that cause intermittent failures

interface FetchOptions extends RequestInit {
  retries?: number;
  retryDelay?: number;
  timeout?: number;
}

const isDev = process.env.NODE_ENV === "development";

// Generate unique request ID for debugging
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export async function robustFetch(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const {
    retries = 2,
    retryDelay = 1000,
    timeout = 30000,
    ...fetchOptions
  } = options;

  const requestId = generateRequestId();

  if (isDev) {
    console.log(`[FETCH ${requestId}] Starting request to: ${url}`);
  }

  // Ensure fresh connections - prevent stale connection reuse
  const freshOptions: RequestInit = {
    ...fetchOptions,
    cache: 'no-store', // Prevent browser from caching failed requests
    keepalive: false, // Don't keep connections alive (force new connections)
    headers: {
      ...fetchOptions.headers,
      // Critical headers to prevent connection reuse
      'Connection': 'close', // Force connection closure after request
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      // Add request ID for debugging
      'X-Request-Id': requestId,
    },
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (isDev && attempt > 0) {
        console.log(`[FETCH ${requestId}] Retry attempt ${attempt}/${retries}`);
      }

      // Create new AbortController for each attempt
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        // Add unique timestamp to prevent connection reuse (only for relative URLs)
        // This forces browser to create new connections instead of reusing stale ones
        let finalUrl = url;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          const separator = url.includes('?') ? '&' : '?';
          finalUrl = `${url}${separator}_t=${Date.now()}`;
        }

        const startTime = Date.now();
        const response = await fetch(finalUrl, {
          ...freshOptions,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        if (isDev) {
          console.log(
            `[FETCH ${requestId}] Response: ${response.status} (${duration}ms)`
          );
        }

        // If response is ok, return it
        if (response.ok) {
          return response;
        }

        // If it's a server error (5xx), retry
        if (response.status >= 500 && attempt < retries) {
          if (isDev) {
            console.warn(
              `[FETCH ${requestId}] Server error ${response.status}, will retry`
            );
          }
          throw new Error(`Server error: ${response.status}`);
        }

        // For client errors (4xx), don't retry
        if (isDev && response.status >= 400) {
          console.warn(
            `[FETCH ${requestId}] Client error ${response.status}, not retrying`
          );
        }
        return response;
      } catch (fetchError) {
        clearTimeout(timeoutId);

        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          if (isDev) {
            console.error(`[FETCH ${requestId}] Request timeout after ${timeout}ms`);
          }
          throw new Error(`Request timeout after ${timeout}ms`);
        }

        if (isDev) {
          console.error(`[FETCH ${requestId}] Fetch error:`, fetchError);
        }
        throw fetchError;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on last attempt
      if (attempt < retries) {
        // Exponential backoff
        const delay = retryDelay * Math.pow(2, attempt);
        if (isDev) {
          console.log(`[FETCH ${requestId}] Waiting ${delay}ms before retry`);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  // If all retries failed, throw the last error
  if (isDev) {
    console.error(`[FETCH ${requestId}] All retries failed:`, lastError);
  }
  throw lastError || new Error('Fetch failed after all retries');
}

