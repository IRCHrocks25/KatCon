import { NextRequest, NextResponse } from 'next/server';

// Input sanitization utilities
export function sanitizeString(input: string, options: {
  maxLength?: number;
  minLength?: number;
  allowHtml?: boolean;
  allowedChars?: RegExp;
} = {}): string {
  const {
    maxLength,
    minLength = 0,
    allowHtml = false,
    allowedChars,
  } = options;

  if (typeof input !== 'string') {
    throw new Error('Input must be a string');
  }

  let sanitized = input.trim();

  // Length validation
  if (minLength > 0 && sanitized.length < minLength) {
    throw new Error(`Input must be at least ${minLength} characters long`);
  }

  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // HTML sanitization (basic)
  if (!allowHtml) {
    sanitized = sanitized
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  // Character filtering
  if (allowedChars && !allowedChars.test(sanitized)) {
    throw new Error('Input contains invalid characters');
  }

  return sanitized;
}

// Validation schemas for different input types
export const ValidationSchemas = {
  // Message content validation
  messageContent: {
    maxLength: 5000,
    minLength: 0,
    allowHtml: false,
  },

  // Conversation name validation
  conversationName: {
    maxLength: 100,
    minLength: 1,
    allowHtml: false,
    allowedChars: /^[a-zA-Z0-9\s\-_()]+$/,
  },

  // User fullname validation
  userFullname: {
    maxLength: 100,
    minLength: 1,
    allowHtml: false,
    allowedChars: /^[a-zA-Z\s\-'.]+$/,
  },

  // Email validation (basic)
  email: {
    maxLength: 254,
    minLength: 3,
    allowHtml: false,
    allowedChars: /^[a-zA-Z0-9@._-]+$/,
  },

  // Username validation
  username: {
    maxLength: 50,
    minLength: 3,
    allowHtml: false,
    allowedChars: /^[a-zA-Z0-9_-]+$/,
  },

  // File name validation
  fileName: {
    maxLength: 255,
    minLength: 1,
    allowHtml: false,
    allowedChars: /^[a-zA-Z0-9._\-\s()]+$/,
  },

  // Search query validation
  searchQuery: {
    maxLength: 100,
    minLength: 0,
    allowHtml: false,
  },
};

// File validation utilities
export const FileValidation = {
  // Maximum file size in bytes (10MB)
  MAX_FILE_SIZE: 10 * 1024 * 1024,

  // Allowed MIME types
  ALLOWED_MIME_TYPES: new Set([
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    // Documents
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // Archives
    'application/zip',
    'application/x-zip-compressed',
  ]),

  // Allowed file extensions
  ALLOWED_EXTENSIONS: new Set([
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
    '.pdf', '.txt', '.md', '.doc', '.docx', '.xls', '.xlsx',
    '.zip',
  ]),

  validateFile(file: {
    size: number;
    type: string;
    name: string;
  }): { valid: boolean; error?: string } {
    // Size validation
    if (file.size > FileValidation.MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File size exceeds maximum allowed size of ${FileValidation.MAX_FILE_SIZE / (1024 * 1024)}MB`,
      };
    }

    // MIME type validation
    if (!FileValidation.ALLOWED_MIME_TYPES.has(file.type)) {
      return {
        valid: false,
        error: `File type ${file.type} is not allowed`,
      };
    }

    // File extension validation
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!FileValidation.ALLOWED_EXTENSIONS.has(extension)) {
      return {
        valid: false,
        error: `File extension ${extension} is not allowed`,
      };
    }

    return { valid: true };
  },
};

// Request validation middleware
export async function validateRequestBody<T>(
  request: NextRequest,
  schema: {
    [K in keyof T]: {
      type: 'string' | 'number' | 'boolean';
      required?: boolean;
      validator?: (value: unknown) => boolean;
      sanitizer?: (value: unknown) => unknown;
    };
  }
): Promise<{ success: true; data: T } | { success: false; error: string; status: number }> {
  try {
    const body = request.body ? await request.clone().json() : {};

    const validatedData = {} as T;

    for (const [key, rules] of Object.entries(schema) as [string, any][]) {
      const value = (body as any)[key];

      // Required field validation
      if (rules.required && (value === undefined || value === null)) {
        return {
          success: false,
          error: `Missing required field: ${key}`,
          status: 400,
        };
      }

      // Skip validation for optional undefined fields
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      if (typeof value !== rules.type) {
        return {
          success: false,
          error: `Field ${key} must be of type ${rules.type}`,
          status: 400,
        };
      }

      // Custom validation
      if (rules.validator && !rules.validator(value)) {
        return {
          success: false,
          error: `Field ${key} failed validation`,
          status: 400,
        };
      }

      // Sanitization
      validatedData[key as keyof T] = rules.sanitizer ? rules.sanitizer(value) : value;
    }

    return {
      success: true,
      data: validatedData,
    };
  } catch (error) {
    return {
      success: false,
      error: 'Invalid JSON in request body',
      status: 400,
    };
  }
}

// UUID validation
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// SQL injection prevention (additional layer)
export function sanitizeSqlInput(input: string): string {
  // Remove potentially dangerous SQL keywords and characters
  return input
    .replace(/;/g, '')
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
    .replace(/xp_/gi, '')
    .replace(/sp_/gi, '')
    .replace(/exec/gi, '')
    .replace(/union/gi, '')
    .replace(/select/gi, '')
    .replace(/insert/gi, '')
    .replace(/update/gi, '')
    .replace(/delete/gi, '')
    .replace(/drop/gi, '')
    .replace(/create/gi, '')
    .replace(/alter/gi, '');
}

// XSS prevention for HTML content (when allowed)
export function sanitizeHtml(input: string): string {
  // Basic HTML sanitization - in production, use a proper HTML sanitizer library
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '');
}

// Rate limiting helper for validation failures
export class ValidationRateLimiter {
  private attempts = new Map<string, { count: number; resetTime: number }>();
  private readonly maxAttempts = 5;
  private readonly windowMs = 15 * 60 * 1000; // 15 minutes

  checkLimit(identifier: string): { allowed: boolean; resetIn?: number } {
    const now = Date.now();
    const attempt = this.attempts.get(identifier);

    if (!attempt || now > attempt.resetTime) {
      this.attempts.set(identifier, { count: 1, resetTime: now + this.windowMs });
      return { allowed: true };
    }

    if (attempt.count >= this.maxAttempts) {
      const resetIn = Math.ceil((attempt.resetTime - now) / 1000);
      return { allowed: false, resetIn };
    }

    attempt.count++;
    return { allowed: true };
  }

  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }
}

export const validationRateLimiter = new ValidationRateLimiter();
