"use client";

import { useState, useRef } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { validateAvatarFile } from "@/lib/supabase/avatar-upload";
import { toast } from "sonner";

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  currentName?: string;
  currentEmail?: string;
  onUpload: (file: File) => Promise<{ url: string }>;
  disabled?: boolean;
}

export function AvatarUpload({
  currentAvatarUrl,
  currentName,
  currentEmail,
  onUpload,
  disabled = false,
}: AvatarUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    const validationError = validateAvatarFile(file);
    if (validationError) {
      toast.error(validationError.message);
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast.error("Please select an image");
      return;
    }

    try {
      setUploading(true);
      const result = await onUpload(file);
      setPreview(null);
      toast.success("Avatar updated successfully");
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to upload avatar"
      );
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    setPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const displayUrl = preview || currentAvatarUrl;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Avatar Display */}
      <div className="relative">
        <Avatar
          src={displayUrl}
          name={currentName}
          email={currentEmail}
          size="lg"
          className="border-4 border-gray-700"
        />
        {uploading && (
          <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
        )}
      </div>

      {/* Upload Controls */}
      <div className="flex flex-col items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileSelect}
          disabled={disabled || uploading}
          className="hidden"
          id="avatar-upload"
        />
        <label
          htmlFor="avatar-upload"
          className={`px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-medium cursor-pointer hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
            disabled || uploading ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          <Upload size={16} />
          {preview ? "Change Image" : "Upload Avatar"}
        </label>

        {preview && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Uploading...
                </>
              ) : (
                "Save"
              )}
            </button>
            <button
              onClick={handleCancel}
              disabled={uploading}
              className="p-2 text-gray-400 hover:text-white transition"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <p className="text-xs text-gray-500 text-center max-w-xs">
          JPEG, PNG, GIF, or WebP. Max 5MB. Image will be resized to 512x512px.
        </p>
      </div>
    </div>
  );
}
