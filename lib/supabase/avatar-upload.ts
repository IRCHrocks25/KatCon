import { supabase } from "./client";

const BUCKET_NAME = "avatars";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_DIMENSION = 512; // Max width/height in pixels

// Allowed image types
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

export interface AvatarUploadResult {
  url: string;
  path: string;
}

export interface AvatarValidationError {
  type: "size" | "type" | "dimension";
  message: string;
}

/**
 * Validate avatar file
 */
export function validateAvatarFile(file: File): AvatarValidationError | null {
  if (file.size > MAX_FILE_SIZE) {
    return {
      type: "size",
      message: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`,
    };
  }

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return {
      type: "type",
      message: "Only JPEG, PNG, GIF, and WebP images are supported",
    };
  }

  return null;
}

/**
 * Resize image to max 512x512px while maintaining aspect ratio
 */
function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions maintaining aspect ratio
        if (width > height) {
          if (width > MAX_DIMENSION) {
            height = (height * MAX_DIMENSION) / width;
            width = MAX_DIMENSION;
          }
        } else {
          if (height > MAX_DIMENSION) {
            width = (width * MAX_DIMENSION) / height;
            height = MAX_DIMENSION;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to resize image"));
            }
          },
          file.type,
          0.9 // Quality for JPEG
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload avatar to Supabase Storage
 */
export async function uploadAvatar(
  userId: string,
  file: File
): Promise<AvatarUploadResult> {
  // Validate file
  const validationError = validateAvatarFile(file);
  if (validationError) {
    throw new Error(validationError.message);
  }

  // Resize image if needed
  let fileToUpload: Blob = file;
  try {
    fileToUpload = await resizeImage(file);
  } catch (error) {
    console.warn("Failed to resize image, uploading original:", error);
    // Continue with original file if resize fails
  }

  // Get file extension
  const extension = file.name.split(".").pop() || "jpg";
  const timestamp = Date.now();
  const filePath = `${userId}/avatar-${timestamp}.${extension}`;

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, fileToUpload, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("Avatar upload error:", error);
    throw new Error("Failed to upload avatar");
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(data.path);

  return {
    url: urlData.publicUrl,
    path: data.path,
  };
}

/**
 * Delete avatar from Supabase Storage
 */
export async function deleteAvatar(filePath: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET_NAME).remove([filePath]);

  if (error) {
    console.error("Avatar delete error:", error);
    throw new Error("Failed to delete avatar");
  }
}

/**
 * Upload avatar via API route (handles profile update automatically)
 */
export async function uploadAvatarViaAPI(
  userId: string,
  file: File
): Promise<{ url: string }> {
  // Validate file
  const validationError = validateAvatarFile(file);
  if (validationError) {
    throw new Error(validationError.message);
  }

  // Resize image if needed
  let fileToUpload: Blob;
  try {
    fileToUpload = await resizeImage(file);
  } catch (error) {
    console.warn("Failed to resize image, uploading original:", error);
    // Continue with original file if resize fails
    fileToUpload = file;
  }

  // Get current user session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  // Generate unique file path
  const extension = file.name.split(".").pop() || "jpg";
  const timestamp = Date.now();
  const filePath = `${userId}/avatar-${timestamp}.${extension}`;

  // Get current avatar to delete it later
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", userId)
    .single();

  // Upload directly to Supabase Storage
  console.log("[AVATAR] Uploading to path:", filePath);
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, fileToUpload, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) {
    console.error("[AVATAR] Upload error:", uploadError);
    throw new Error("Failed to upload avatar to storage");
  }

  console.log("[AVATAR] Upload successful:", uploadData);

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(uploadData.path);

  console.log("[AVATAR] Public URL:", urlData.publicUrl);

  // Update profile with new avatar URL
  console.log("[AVATAR] Updating profile for user:", userId);
  const { data: updateData, error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: urlData.publicUrl })
    .eq("id", userId)
    .select();

  if (updateError) {
    console.error("[AVATAR] Profile update error:", updateError);
    // Try to clean up uploaded file
    await supabase.storage.from(BUCKET_NAME).remove([filePath]);
    throw new Error("Failed to update profile with new avatar");
  }

  console.log("[AVATAR] Profile updated successfully:", updateData);

  // Delete old avatar if it exists
  if (currentProfile?.avatar_url) {
    try {
      const urlParts = currentProfile.avatar_url.split("/");
      const pathIndex = urlParts.indexOf(BUCKET_NAME);
      if (pathIndex >= 0 && pathIndex < urlParts.length - 1) {
        const oldPath = urlParts.slice(pathIndex + 1).join("/");
        await supabase.storage.from(BUCKET_NAME).remove([oldPath]);
      }
    } catch (error) {
      // Ignore errors when deleting old avatar
      console.warn("Failed to delete old avatar:", error);
    }
  }

  return { url: urlData.publicUrl };
}
