// Robust fetch wrapper with connection management and retry logic
// Fixes stale connection issues where requests stop working after ~5 minutes
// Prevents HTTP connection pooling issues that cause intermittent failures

interface FetchOptions extends RequestInit {
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  forceCloseConnection?: boolean; // Force Connection: close header (for unreliable endpoints)
}

const isDev = process.env.NODE_ENV === "development";
// Allow production logging for debugging (set NEXT_PUBLIC_ENABLE_PROD_LOGS=true)
const enableProdLogs = process.env.NEXT_PUBLIC_ENABLE_PROD_LOGS === "true";
const shouldLog = isDev || enableProdLogs;

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
    forceCloseConnection = false, // Default: allow connection reuse for performance
    ...fetchOptions
  } = options;

  const requestId = generateRequestId();

  if (shouldLog) {
    console.log(`[FETCH ${requestId}] Starting request to: ${url}`);
    // Log if Authorization header is present (but don't log the actual token)
    if (fetchOptions.headers) {
      const headers = new Headers(fetchOptions.headers);
      if (headers.has('Authorization')) {
        console.log(`[FETCH ${requestId}] Has Authorization header: YES`);
      }
    }
  }

  // Preserve existing headers (especially auth headers from Supabase)
  const existingHeaders = new Headers(fetchOptions.headers);
  
  // Add connection management headers (but don't override existing ones)
  // Only force Connection: close for unreliable external endpoints
  if (forceCloseConnection && !existingHeaders.has('Connection')) {
    existingHeaders.set('Connection', 'close');
  }
  
  // Always prevent caching for fresh data
  if (!existingHeaders.has('Cache-Control')) {
    existingHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  if (!existingHeaders.has('Pragma')) {
    existingHeaders.set('Pragma', 'no-cache');
  }
  if (!existingHeaders.has('Expires')) {
    existingHeaders.set('Expires', '0');
  }
  
  // Always add request ID for debugging
  existingHeaders.set('X-Request-Id', requestId);

  // Configure fetch options
  const freshOptions: RequestInit = {
    ...fetchOptions,
    cache: 'no-store', // Prevent browser from caching failed requests
    // keepalive: Allow browser to reuse connections unless explicitly disabled
    keepalive: !forceCloseConnection,
    headers: existingHeaders,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (shouldLog && attempt > 0) {
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

        if (shouldLog) {
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
          if (shouldLog) {
            console.warn(
              `[FETCH ${requestId}] Server error ${response.status}, will retry`
            );
          }
          throw new Error(`Server error: ${response.status}`);
        }

        // For client errors (4xx), don't retry
        if (shouldLog && response.status >= 400) {
          console.warn(
            `[FETCH ${requestId}] Client error ${response.status}, not retrying`
          );
        }
        return response;
      } catch (fetchError) {
        clearTimeout(timeoutId);

        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          if (shouldLog) {
            console.error(`[FETCH ${requestId}] Request timeout after ${timeout}ms`);
          }
          throw new Error(`Request timeout after ${timeout}ms`);
        }

        if (shouldLog) {
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
        if (shouldLog) {
          console.log(`[FETCH ${requestId}] Waiting ${delay}ms before retry`);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  // If all retries failed, throw the last error
  if (shouldLog) {
    console.error(`[FETCH ${requestId}] All retries failed:`, lastError);
  }
  throw lastError || new Error('Fetch failed after all retries');
}

