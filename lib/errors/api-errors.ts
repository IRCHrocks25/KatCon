/**
 * Standardized API error handling for Next.js routes
 * Provides consistent error responses and logging
 */

export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: string;
}

export class ApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: string;

  constructor(
    code: string,
    message: string,
    statusCode: number = 500,
    details?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

// Predefined error types for consistency
export const ErrorCodes = {
  // Authentication errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',

  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',

  // Permission errors
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  NOT_OWNER: 'NOT_OWNER',

  // External service errors
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',

  // Generic errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
} as const;

// Error response factory functions
export const createErrorResponse = (error: ApiError | Error | unknown) => {
  // Handle ApiError instances
  if (error instanceof ApiError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        ...(process.env.NODE_ENV === 'development' && error.details && { details: error.details }),
      },
    };
  }

  // Handle generic errors
  if (error instanceof Error) {
    return {
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'An unexpected error occurred',
        ...(process.env.NODE_ENV === 'development' && { details: error.message }),
      },
    };
  }

  // Handle unknown errors
  return {
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    },
  };
};

// Common error instances for reuse
export const Errors = {
  UNAUTHORIZED: new ApiError(
    ErrorCodes.UNAUTHORIZED,
    'Authentication required',
    401
  ),

  FORBIDDEN: new ApiError(
    ErrorCodes.FORBIDDEN,
    'Access denied',
    403
  ),

  NOT_FOUND: new ApiError(
    ErrorCodes.NOT_FOUND,
    'Resource not found',
    404
  ),

  VALIDATION_ERROR: (field: string, reason: string) => new ApiError(
    ErrorCodes.VALIDATION_ERROR,
    `Invalid ${field}`,
    400,
    reason
  ),

  MISSING_FIELD: (field: string) => new ApiError(
    ErrorCodes.MISSING_REQUIRED_FIELD,
    `Missing required field: ${field}`,
    400
  ),

  INTERNAL_ERROR: new ApiError(
    ErrorCodes.INTERNAL_ERROR,
    'Internal server error',
    500
  ),

  DATABASE_ERROR: new ApiError(
    ErrorCodes.DATABASE_ERROR,
    'Database operation failed',
    500
  ),
} as const;

/**
 * Enhanced error logging with context
 */
export const logApiError = (
  error: unknown,
  context: {
    route?: string;
    method?: string;
    userId?: string;
    operation?: string;
    [key: string]: unknown;
  } = {}
) => {
  const timestamp = new Date().toISOString();
  const errorDetails = {
    timestamp,
    ...context,
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : String(error),
  };

  console.error('[API ERROR]', JSON.stringify(errorDetails, null, 2));
};

/**
 * Safe error handler for API routes
 * Handles errors consistently and returns appropriate responses
 */
export const handleApiError = (
  error: unknown,
  context: {
    route?: string;
    method?: string;
    userId?: string;
    operation?: string;
    [key: string]: unknown;
  } = {}
) => {
  logApiError(error, context);

  if (error instanceof ApiError) {
    return new Response(
      JSON.stringify(createErrorResponse(error)),
      {
        status: error.statusCode,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // For non-ApiError instances, return 500
  return new Response(
    JSON.stringify(createErrorResponse(error)),
    {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};

/**
 * Input validation utilities
 */
export const validateRequired = <T>(
  value: T | null | undefined,
  fieldName: string
): T => {
  if (value === null || value === undefined || value === '') {
    throw Errors.MISSING_FIELD(fieldName);
  }
  return value;
};

export const validateEmail = (email: string): string => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw Errors.VALIDATION_ERROR('email', 'Invalid email format');
  }
  return email.toLowerCase().trim();
};

export const validateStringLength = (
  value: string,
  fieldName: string,
  min?: number,
  max?: number
): string => {
  if (min !== undefined && value.length < min) {
    throw Errors.VALIDATION_ERROR(
      fieldName,
      `Must be at least ${min} characters`
    );
  }
  if (max !== undefined && value.length > max) {
    throw Errors.VALIDATION_ERROR(
      fieldName,
      `Must be at most ${max} characters`
    );
  }
  return value.trim();
};

/**
 * Type guard for API responses
 */
export const isApiError = (response: unknown): response is ApiError => {
  return (
    response !== null &&
    typeof response === 'object' &&
    'code' in response &&
    'message' in response &&
    typeof (response as Record<string, unknown>).code === 'string' &&
    typeof (response as Record<string, unknown>).message === 'string'
  );
};
