import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

interface UserStatusData {
  user_id: string;
  status_text?: string | null;
  status_emoji?: string | null;
  expires_at?: string | null;
  updated_at: string;
}

interface UserStatusResponse {
  statusText: string | null;
  statusEmoji: string | null;
  expiresAt: string | null;
  updatedAt: string;
}

// GET: Get user status (can get specific user or current user)
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    const targetUserId = userId || user.id;

    // Get user status
    const { data: status, error: statusError } = await supabase
      .from("user_status")
      .select("*")
      .eq("user_id", targetUserId)
      .single();

    if (statusError && statusError.code !== "PGRST116") {
      // PGRST116 is "not found" which is fine
      console.error("Error fetching user status:", statusError);
      return NextResponse.json(
        { error: "Failed to fetch status" },
        { status: 500 }
      );
    }

    // Check if status has expired
    if (status && status.expires_at) {
      const expiresAt = new Date(status.expires_at);
      if (expiresAt < new Date()) {
        // Status expired, clear it
        await supabase
          .from("user_status")
          .delete()
          .eq("user_id", targetUserId);

        return NextResponse.json({ status: null });
      }
    }

    // Transform database format to frontend format
    const formattedStatus = status
      ? {
          userId: status.user_id,
          statusText: status.status_text,
          statusEmoji: status.status_emoji,
          expiresAt: status.expires_at,
          updatedAt: status.updated_at,
        }
      : null;

    return NextResponse.json({ status: formattedStatus });
  } catch (error) {
    console.error("Error in get user status API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Set or update user status
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
    const { statusText, statusEmoji, expiresAt } = body;

    // If all fields are null/empty, clear status
    if (!statusText && !statusEmoji && !expiresAt) {
      const { error: deleteError } = await supabase
        .from("user_status")
        .delete()
        .eq("user_id", user.id);

      if (deleteError) {
        console.error("Error clearing status:", deleteError);
        return NextResponse.json(
          { error: "Failed to clear status" },
          { status: 500 }
        );
      }

      return NextResponse.json({ status: null });
    }

    // Upsert status
    const statusData: Partial<UserStatusData> = {
      user_id: user.id,
      updated_at: new Date().toISOString(),
    };

    if (statusText !== undefined) statusData.status_text = statusText || null;
    if (statusEmoji !== undefined) statusData.status_emoji = statusEmoji || null;
    if (expiresAt !== undefined) statusData.expires_at = expiresAt || null;

    const { data: status, error: upsertError } = await supabase
      .from("user_status")
      .upsert(statusData, { onConflict: "user_id" })
      .select()
      .single();

    if (upsertError) {
      console.error("Error setting status:", upsertError);
      return NextResponse.json(
        { error: "Failed to set status" },
        { status: 500 }
      );
    }

    // Transform database format to frontend format
    const formattedStatus = status
      ? {
          userId: status.user_id,
          statusText: status.status_text,
          statusEmoji: status.status_emoji,
          expiresAt: status.expires_at,
          updatedAt: status.updated_at,
        }
      : null;

    return NextResponse.json({ status: formattedStatus });
  } catch (error) {
    console.error("Error in set user status API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: Get multiple user statuses (for batch fetching)
export async function PUT(request: NextRequest) {
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
    const { userIds } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: "userIds array is required" },
        { status: 400 }
      );
    }

    // Get statuses for multiple users
    const { data: statuses, error: statusError } = await supabase
      .from("user_status")
      .select("*")
      .in("user_id", userIds);

    if (statusError) {
      console.error("Error fetching user statuses:", statusError);
      return NextResponse.json(
        { error: "Failed to fetch statuses" },
        { status: 500 }
      );
    }

    // Filter out expired statuses
    const now = new Date();
    const validStatuses = (statuses || []).filter((status) => {
      if (!status.expires_at) return true;
      return new Date(status.expires_at) >= now;
    });

    // Clear expired statuses
    const expiredStatuses = (statuses || []).filter((status) => {
      if (!status.expires_at) return false;
      return new Date(status.expires_at) < now;
    });

    if (expiredStatuses.length > 0) {
      const expiredUserIds = expiredStatuses.map((s) => s.user_id);
      await supabase
        .from("user_status")
        .delete()
        .in("user_id", expiredUserIds);
    }

    // Format response as map
    const statusMap: Record<string, UserStatusResponse> = {};
    validStatuses.forEach((status) => {
      statusMap[status.user_id] = {
        statusText: status.status_text,
        statusEmoji: status.status_emoji,
        expiresAt: status.expires_at,
        updatedAt: status.updated_at,
      };
    });

    return NextResponse.json({ statuses: statusMap });
  } catch (error) {
    console.error("Error in batch get user statuses API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

