import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "Unauthorized", messages: [] },
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
        { error: "Unauthorized", messages: [] },
        { status: 401 }
      );
    }

    const { messageId } = await params;

    // Get parent message to verify access
    const { data: parentMessage, error: parentError } = await supabase
      .from("messages")
      .select("conversation_id")
      .eq("id", messageId)
      .single();

    if (parentError || !parentMessage) {
      return NextResponse.json(
        { error: "Parent message not found", messages: [] },
        { status: 404 }
      );
    }

    // Verify user is a participant in the conversation
    const { data: participant } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("conversation_id", parentMessage.conversation_id)
      .eq("user_id", user.id)
      .single();

    if (!participant) {
      return NextResponse.json(
        { error: "Access denied", messages: [] },
        { status: 403 }
      );
    }

    // Get all thread replies
    const { data: threadMessages, error: threadError } = await supabase
      .from("messages")
      .select("*")
      .eq("parent_message_id", messageId)
      .order("created_at", { ascending: true });

    if (threadError) {
      console.error("Error fetching thread messages:", threadError);
      return NextResponse.json(
        { error: "Failed to fetch thread messages", messages: [] },
        { status: 500 }
      );
    }

    // Get read receipts
    const threadMessageIds = (threadMessages || []).map((m) => m.id);
    const { data: reads } = await supabase
      .from("message_reads")
      .select("message_id, user_id")
      .in("message_id", threadMessageIds);

    const readByMap = new Map<string, string[]>();
    (reads || []).forEach((read) => {
      if (!readByMap.has(read.message_id)) {
        readByMap.set(read.message_id, []);
      }
      readByMap.get(read.message_id)!.push(read.user_id);
    });

    // Get sender profiles
    const senderIds = [
      ...new Set((threadMessages || []).map((m) => m.author_id)),
    ];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, fullname")
      .in("id", senderIds);

    const profileMap = new Map<string, any>();
    (profiles || []).forEach((p) => {
      profileMap.set(p.id, p);
    });

    // Format messages
    const formattedMessages = (threadMessages || []).map((msg) => {
      const profile = profileMap.get(msg.author_id);
      return {
        id: msg.id,
        conversation_id: msg.conversation_id,
        author_id: msg.author_id,
        author_email: profile?.email || "",
        author_fullname: profile?.fullname || null,
        content: msg.content,
        created_at: msg.created_at,
        parent_message_id: msg.parent_message_id,
        thread_reply_count: 0,
        read_by: readByMap.get(msg.id) || [],
        file_url: msg.file_url || null,
        file_name: msg.file_name || null,
        file_type: msg.file_type || null,
        file_size: msg.file_size || null,
      };
    });

    return NextResponse.json({ messages: formattedMessages });
  } catch (error) {
    console.error("Error in threads/[messageId] GET API route:", error);
    return NextResponse.json(
      { error: "Internal server error", messages: [] },
      { status: 500 }
    );
  }
}




