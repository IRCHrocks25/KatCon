import {
  sanitizeString,
  isValidUUID,
  FileValidation,
  sanitizeHtml,
  ValidationSchemas,
} from "../validation";

describe("Validation Utils", () => {
  describe("sanitizeString", () => {
    it("escapes dangerous HTML characters", () => {
      expect(sanitizeString('<script>alert("xss")</script>')).toBe(
        "&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;"
      );
    });

    it("validates minimum length", () => {
      expect(() => sanitizeString("a", { minLength: 5 })).toThrow(
        "Input must be at least 5 characters long"
      );
    });

    it("validates maximum length", () => {
      const result = sanitizeString(
        "this is a very long string that should be truncated",
        { maxLength: 10 }
      );
      expect(result).toBe("this is a ");
    });

    it("validates allowed characters", () => {
      expect(() =>
        sanitizeString("invalid@chars!", {
          allowedChars: /^[a-zA-Z0-9\s]+$/,
        })
      ).toThrow("Input contains invalid characters");
    });

    it("uses predefined schemas", () => {
      expect(() =>
        sanitizeString("", ValidationSchemas.conversationName)
      ).toThrow();
      expect(
        sanitizeString("Valid Name 123", ValidationSchemas.conversationName)
      ).toBe("Valid Name 123");
    });
  });

  describe("isValidUUID", () => {
    it("validates correct UUID format", () => {
      expect(isValidUUID("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
      expect(isValidUUID("not-a-uuid")).toBe(false);
      expect(isValidUUID("")).toBe(false);
    });
  });

  describe("FileValidation", () => {
    describe("validateFile", () => {
      it("accepts valid files", () => {
        const validFile = {
          size: 1024 * 1024, // 1MB
          type: "image/jpeg",
          name: "test.jpg",
        };
        expect(FileValidation.validateFile(validFile).valid).toBe(true);
      });

      it("rejects files that are too large", () => {
        const largeFile = {
          size: 20 * 1024 * 1024, // 20MB
          type: "image/jpeg",
          name: "large.jpg",
        };
        const result = FileValidation.validateFile(largeFile);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("File size exceeds maximum");
      });

      it("rejects invalid file types", () => {
        const invalidFile = {
          size: 1024,
          type: "application/exe",
          name: "malware.exe",
        };
        const result = FileValidation.validateFile(invalidFile);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("not allowed");
      });

      it("rejects invalid file extensions", () => {
        const invalidFile = {
          size: 1024,
          type: "text/plain",
          name: "script.bat",
        };
        const result = FileValidation.validateFile(invalidFile);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("not allowed");
      });
    });
  });

  describe("sanitizeHtml", () => {
    it("removes script tags", () => {
      const input = '<script>alert("xss")</script><p>Hello</p>';
      expect(sanitizeHtml(input)).toBe("<p>Hello</p>");
    });

    it("removes iframe tags", () => {
      const input = '<iframe src="malicious.com"></iframe><div>Safe</div>';
      expect(sanitizeHtml(input)).toBe("<div>Safe</div>");
    });

    it("removes javascript protocols", () => {
      const input = '<a href="javascript:alert(1)">Click me</a>';
      expect(sanitizeHtml(input)).toBe('<a href="alert(1)">Click me</a>');
    });

    it("removes event handlers", () => {
      const input = '<button onclick="alert(1)">Click</button>';
      expect(sanitizeHtml(input)).toBe("<button >Click</button>");
    });
  });
});
