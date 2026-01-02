import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
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

    const { conversationId } = await params;

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

    // Get all unread messages in this conversation (top-level only)
    const { data: unreadMessages } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .is("parent_message_id", null)
      .neq("author_id", user.id);

    const unreadMessageIds = unreadMessages?.map((m) => m.id) || [];

    if (unreadMessageIds.length === 0) {
      return NextResponse.json({ success: true });
    }

    // Check which messages are already read
    const { data: alreadyRead } = await supabase
      .from("message_reads")
      .select("message_id")
      .eq("user_id", user.id)
      .in("message_id", unreadMessageIds);

    const alreadyReadIds = new Set(alreadyRead?.map((r) => r.message_id) || []);
    const toMarkAsRead = unreadMessageIds.filter(
      (id) => !alreadyReadIds.has(id)
    );

    if (toMarkAsRead.length === 0) {
      return NextResponse.json({ success: true });
    }

    // Mark messages as read - use upsert to handle potential duplicates
    const readInserts = toMarkAsRead.map((messageId) => ({
      message_id: messageId,
      user_id: user.id,
    }));

    // Use upsert with conflict resolution on the unique constraint
    const { error: readError } = await supabase
      .from("message_reads")
      .upsert(readInserts, {
        onConflict: "message_id,user_id",
        ignoreDuplicates: true,
      });

    if (readError) {
      console.error("Error marking messages as read:", readError);
      return NextResponse.json(
        { error: "Failed to mark messages as read" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in read/[conversationId] POST API route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



