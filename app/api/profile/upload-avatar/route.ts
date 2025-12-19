import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const BUCKET_NAME = "avatars";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get form data
    const formData = await request.formData();
    const file = formData.get("avatar") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, GIF, and WebP images are supported" },
        { status: 400 }
      );
    }

    // Get current profile to find old avatar
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .single();

    // Delete old avatar if exists
    if (currentProfile?.avatar_url) {
      // Extract path from URL (format: /storage/v1/object/public/avatars/{path})
      const urlParts = currentProfile.avatar_url.split("/");
      const pathIndex = urlParts.indexOf("avatars");
      if (pathIndex >= 0 && pathIndex < urlParts.length - 1) {
        const oldPath = urlParts.slice(pathIndex + 1).join("/");
        await supabase.storage.from(BUCKET_NAME).remove([oldPath]);
      }
    }

    // Generate unique file path
    const extension = file.name.split(".").pop() || "jpg";
    const timestamp = Date.now();
    const filePath = `${user.id}/avatar-${timestamp}.${extension}`;

    // Convert File to ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) {
      console.error("Avatar upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload avatar" },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(uploadData.path);

    // Update profile with new avatar URL
    const { data: updatedProfile, error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: urlData.publicUrl })
      .eq("id", user.id)
      .select(
        "id, email, fullname, username, avatar_url, account_type, approved"
      )
      .single();

    if (updateError) {
      console.error("Error updating profile with avatar URL:", updateError);
      // Try to delete uploaded file
      await supabase.storage.from(BUCKET_NAME).remove([filePath]);
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      avatarUrl: urlData.publicUrl,
      profile: {
        id: updatedProfile.id,
        email: updatedProfile.email || "",
        fullname: updatedProfile.fullname || undefined,
        username: updatedProfile.username || undefined,
        avatarUrl: updatedProfile.avatar_url || undefined,
        accountType: updatedProfile.account_type,
        approved: updatedProfile.approved || false,
      },
    });
  } catch (error) {
    console.error("Error in avatar upload API route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
