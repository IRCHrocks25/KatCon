// Robust fetch wrapper with connection management and retry logic
// Fixes stale connection issues where requests stop working after ~5 minutes

interface FetchOptions extends RequestInit {
  retries?: number;
  retryDelay?: number;
  timeout?: number;
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

  // Ensure fresh connections - prevent stale connection reuse
  const freshOptions: RequestInit = {
    ...fetchOptions,
    cache: 'no-store', // Prevent browser from caching failed requests
    keepalive: false, // Don't keep connections alive (force new connections)
    headers: {
      ...fetchOptions.headers,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
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

        const response = await fetch(finalUrl, {
          ...freshOptions,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // If response is ok, return it
        if (response.ok) {
          return response;
        }

        // If it's a server error (5xx), retry
        if (response.status >= 500 && attempt < retries) {
          throw new Error(`Server error: ${response.status}`);
        }

        // For client errors (4xx), don't retry
        return response;
      } catch (fetchError) {
        clearTimeout(timeoutId);

        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error(`Request timeout after ${timeout}ms`);
        }

        throw fetchError;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on last attempt
      if (attempt < retries) {
        // Exponential backoff
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  // If all retries failed, throw the last error
  throw lastError || new Error('Fetch failed after all retries');
}

