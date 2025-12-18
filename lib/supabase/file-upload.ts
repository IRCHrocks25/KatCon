import { supabase } from "./client";

const BUCKET_NAME = "message-attachments";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Supported file types
export const ALLOWED_MIME_TYPES = [
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Spreadsheets
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Presentations
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Text
  "text/plain",
  "text/csv",
  // Archives
  "application/zip",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
];

export interface FileUploadResult {
  url: string;
  path: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export interface FileValidationError {
  type: "size" | "type";
  message: string;
}

/**
 * Validate a file before upload
 */
export function validateFile(file: File): FileValidationError | null {
  if (file.size > MAX_FILE_SIZE) {
    return {
      type: "size",
      message: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`,
    };
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      type: "type",
      message: "File type not supported",
    };
  }

  return null;
}

/**
 * Upload a file to Supabase Storage
 */
export async function uploadFile(
  file: File,
  userId: string,
  conversationId: string
): Promise<FileUploadResult> {
  // Validate file
  const validationError = validateFile(file);
  if (validationError) {
    throw new Error(validationError.message);
  }

  // Generate unique file path: userId/conversationId/timestamp-filename
  const timestamp = Date.now();
  const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const filePath = `${userId}/${conversationId}/${timestamp}-${sanitizedFileName}`;

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("File upload error:", error);
    throw new Error("Failed to upload file");
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(data.path);

  return {
    url: urlData.publicUrl,
    path: data.path,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
  };
}

/**
 * Delete a file from Supabase Storage
 */
export async function deleteFile(filePath: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET_NAME).remove([filePath]);

  if (error) {
    console.error("File delete error:", error);
    throw new Error("Failed to delete file");
  }
}

/**
 * Get public URL for a file
 */
export function getFileUrl(filePath: string): string {
  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
  return data.publicUrl;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * Check if file is an image
 */
export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/**
 * Get file icon based on mime type
 */
export function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "file-text";
  if (
    mimeType.includes("word") ||
    mimeType.includes("document")
  )
    return "file-text";
  if (mimeType.includes("excel") || mimeType.includes("spreadsheet"))
    return "file-spreadsheet";
  if (mimeType.includes("powerpoint") || mimeType.includes("presentation"))
    return "file-presentation";
  if (mimeType === "text/plain" || mimeType === "text/csv") return "file-text";
  if (
    mimeType.includes("zip") ||
    mimeType.includes("rar") ||
    mimeType.includes("7z")
  )
    return "file-archive";
  return "file";
}

