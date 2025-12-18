import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
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
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id: conversationId } = await params;

    // Verify user is a participant
    const { data: participant } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .single();

    if (!participant) {
      return NextResponse.json(
        { error: "Conversation not found or access denied" },
        { status: 404 }
      );
    }

    // Get conversation
    const { data: conversation, error: convError } = await supabase
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

    // Get participants
    const { data: participants } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId);

    const participantIds = participants?.map((p) => p.user_id) || [];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, fullname")
      .in("id", participantIds);

    // Calculate unread count
    const { data: unreadMsgs } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .is("parent_message_id", null)
      .neq("author_id", user.id);

    const unreadMsgIds = unreadMsgs?.map((m) => m.id) || [];
    let unreadCount = 0;
    if (unreadMsgIds.length > 0) {
      const { count: readCount } = await supabase
        .from("message_reads")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("message_id", unreadMsgIds);

      unreadCount = unreadMsgIds.length - (readCount || 0);
    }

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        name: conversation.name,
        description: conversation.description,
        type: conversation.type,
        is_private: conversation.is_private,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
        participants:
          profiles?.map((p) => ({
            userId: p.id,
            email: p.email || "",
            fullname: p.fullname || null,
          })) || [],
        unread_count: unreadCount,
      },
    });
  } catch (error) {
    console.error("Error in conversations/[id] GET API route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE: Delete a channel (creator only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
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
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id: conversationId } = await params;

    // Use service role to read and delete
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

    // Only the creator can delete the channel
    if (conversation.created_by !== user.id) {
      return NextResponse.json(
        { error: "Only the channel creator can delete this channel" },
        { status: 403 }
      );
    }

    // Delete in order: message_reads -> messages -> conversation_participants -> conversation
    // 1. Delete message reads for all messages in this conversation
    const { data: messageIds } = await adminSupabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId);

    if (messageIds && messageIds.length > 0) {
      const msgIds = messageIds.map((m) => m.id);
      await adminSupabase
        .from("message_reads")
        .delete()
        .in("message_id", msgIds);
    }

    // 2. Delete all messages in the conversation
    await adminSupabase
      .from("messages")
      .delete()
      .eq("conversation_id", conversationId);

    // 3. Delete all participants
    await adminSupabase
      .from("conversation_participants")
      .delete()
      .eq("conversation_id", conversationId);

    // 4. Delete the conversation itself
    const { error: deleteError } = await adminSupabase
      .from("conversations")
      .delete()
      .eq("id", conversationId);

    if (deleteError) {
      console.error("Error deleting conversation:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete channel" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in conversations/[id] DELETE API route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
