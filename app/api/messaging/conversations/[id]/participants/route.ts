import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Helper to get authed user
async function getAuthedUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return { error: "Unauthorized", status: 401 as const, user: null };
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
    return { error: "Unauthorized", status: 401 as const, user: null };
  }

  return { error: null, status: 200 as const, user, supabase };
}

// POST: Join a channel or add a participant
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await getAuthedUser(request);
    if (!authResult.user || !authResult.supabase) {
      return NextResponse.json(
        { error: authResult.error || "Unauthorized" },
        { status: authResult.status }
      );
    }

    const { user, supabase } = authResult;
    const { id: conversationId } = await params;
    const body = await request.json().catch(() => ({}));
    const targetUserId: string = body.user_id || user.id;

    // Use service role to read conversation details so public channels are visible
    const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get conversation details
    const { data: conversation, error: convError } = await adminSupabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Public channels: anyone can join themselves
    const isPublicChannel =
      conversation.type === "channel" && conversation.is_private === false;

    if (targetUserId !== user.id) {
      // Adding someone else: only the creator can add members
      if (conversation.created_by !== user.id) {
        return NextResponse.json(
          { error: "Only the channel creator can add members" },
          { status: 403 }
        );
      }

      // And they must be a participant as well (sanity check)
      const { data: requesterParticipant } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id)
        .single();

      if (!requesterParticipant) {
        return NextResponse.json(
          { error: "Only participants can add other users" },
          { status: 403 }
        );
      }
    } else if (!isPublicChannel) {
      // Non-public conversation: only existing participants can add themselves
      const { data: selfParticipant } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id)
        .single();

      if (!selfParticipant) {
        return NextResponse.json(
          { error: "Cannot join a private conversation" },
          { status: 403 }
        );
      }
    }

    // Check if already a participant
    const { data: existingParticipant } = await adminSupabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (!existingParticipant) {
      const { error: insertError } = await adminSupabase
        .from("conversation_participants")
        .insert({
          conversation_id: conversationId,
          user_id: targetUserId,
        });

      if (insertError) {
        console.error("Error adding participant:", insertError);
        return NextResponse.json(
          { error: "Failed to add participant" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      "Error in conversations/[id]/participants POST API route:",
      error
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE: Leave a channel or remove a participant
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await getAuthedUser(request);
    if (!authResult.user || !authResult.supabase) {
      return NextResponse.json(
        { error: authResult.error || "Unauthorized" },
        { status: authResult.status }
      );
    }

    const { user, supabase } = authResult;
    const { id: conversationId } = await params;
    const body = await request.json().catch(() => ({}));
    const targetUserId: string = body.user_id || user.id;

    // Use service role to read conversation details to avoid RLS hiding it
    const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get conversation details
    const { data: conversation, error: convError } = await adminSupabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    if (targetUserId !== user.id) {
      // Removing someone else: only the creator can remove members
      if (conversation.created_by !== user.id) {
        return NextResponse.json(
          { error: "Only the channel creator can remove members" },
          { status: 403 }
        );
      }

      // And they must be a participant as well (sanity check)
      const { data: requesterParticipant } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id)
        .single();

      if (!requesterParticipant) {
        return NextResponse.json(
          { error: "Only participants can remove other users" },
          { status: 403 }
        );
      }
    } else {
      // User is trying to leave - prevent if they are the creator
      if (conversation.created_by === user.id) {
        return NextResponse.json(
          { error: "Channel creator cannot leave the channel. Delete the channel instead." },
          { status: 403 }
        );
      }
    }

    const { error: deleteError } = await adminSupabase
      .from("conversation_participants")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("user_id", targetUserId);

    if (deleteError) {
      console.error("Error removing participant:", deleteError);
      return NextResponse.json(
        { error: "Failed to remove participant" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      "Error in conversations/[id]/participants DELETE API route:",
      error
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


