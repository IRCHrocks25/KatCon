import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

interface ProfileUpdateFields {
  username?: string;
  fullname?: string | null;
}

/**
 * Validate username format
 */
function validateUsername(username: string): {
  valid: boolean;
  error?: string;
} {
  // Length check
  if (username.length < 3) {
    return { valid: false, error: "Username must be at least 3 characters" };
  }
  if (username.length > 30) {
    return { valid: false, error: "Username must be at most 30 characters" };
  }

  // Character check: alphanumeric, underscore, hyphen only
  const usernameRegex = /^[a-zA-Z0-9_-]+$/;
  if (!usernameRegex.test(username)) {
    return {
      valid: false,
      error:
        "Username can only contain letters, numbers, underscores, and hyphens",
    };
  }

  return { valid: true };
}

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

    const body = await request.json();
    const { username, fullname } = body;

    // Build update object
    const updates: Partial<ProfileUpdateFields> = {};

    if (username !== undefined) {
      // Validate username
      const validation = validateUsername(username);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      // Check uniqueness (excluding current user)
      const { data: existingUser, error: checkError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .neq("id", user.id)
        .single();

      if (checkError && checkError.code !== "PGRST116") {
        // PGRST116 is "not found" which is what we want
        console.error("Error checking username uniqueness:", checkError);
        return NextResponse.json(
          { error: "Failed to validate username" },
          { status: 500 }
        );
      }

      if (existingUser) {
        return NextResponse.json(
          { error: "Username is already taken" },
          { status: 400 }
        );
      }

      updates.username = username;
    }

    if (fullname !== undefined) {
      // Sanitize fullname (trim, max length)
      const sanitized = fullname?.trim() || null;
      if (sanitized && sanitized.length > 100) {
        return NextResponse.json(
          { error: "Full name must be at most 100 characters" },
          { status: 400 }
        );
      }
      updates.fullname = sanitized;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    // Update profile
    const { data: updatedProfile, error: updateError } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id)
      .select(
        "id, email, fullname, username, avatar_url, account_type, approved"
      )
      .single();

    if (updateError) {
      console.error("Error updating profile:", updateError);
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({
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
    console.error("Error in profile update API route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
