import '@testing-library/jest-dom'

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      pathname: '/',
      query: '',
      asPath: '/',
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return '/'
  },
}))

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

// Mock Web APIs that might not be available in test environment
if (typeof global.Request === 'undefined') {
  global.Request = class Request {
    constructor(input, init) {
      this.input = input
      this.init = init
    }
  }
}

if (typeof global.Response === 'undefined') {
  global.Response = class Response {
    constructor(body, init) {
      this.body = body
      this.init = init
      this.status = init?.status || 200
      this.statusText = init?.statusText || 'OK'
      this.headers = new Map(Object.entries(init?.headers || {}))
    }

    json() {
      return Promise.resolve(this.body)
    }

    text() {
      return Promise.resolve(JSON.stringify(this.body))
    }

    clone() {
      return new Response(this.body, this.init)
    }
  }
}

// Mock URL constructor if not available
if (typeof global.URL === 'undefined') {
  global.URL = class URL {
    constructor(url) {
      this.href = url
      this.pathname = url.split('?')[0]
      this.search = url.includes('?') ? '?' + url.split('?')[1] : ''
      this.searchParams = new URLSearchParams(this.search)
    }
  }
}

// Mock Next.js NextResponse
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body, options = {}) => {
      const response = new Response(JSON.stringify(body), {
        status: options.status || 200,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      // Add custom properties for testing
      response.status = options.status || 200;
      response.headers.get = jest.fn((name) => {
        if (name === 'content-type') return 'application/json';
        return null;
      });

      return response;
    },
  },
}));
