import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// GET: Get messages for a conversation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
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

    const { conversationId } = await params;
    const { searchParams } = new URL(request.url);
    const beforeMessageId = searchParams.get("before");

    // Verify user is a participant
    const { data: participant } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .single();

    if (!participant) {
      return NextResponse.json(
        { error: "Conversation not found or access denied", messages: [] },
        { status: 404 }
      );
    }

    // Build query
    let query = supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .is("parent_message_id", null) // Only top-level messages
      .order("created_at", { ascending: false })
      .limit(50);

    // If beforeMessageId is provided, get messages before that
    if (beforeMessageId) {
      const { data: beforeMessage } = await supabase
        .from("messages")
        .select("created_at")
        .eq("id", beforeMessageId)
        .single();

      if (beforeMessage) {
        query = query.lt("created_at", beforeMessage.created_at);
      }
    }

    const { data: messages, error: messagesError } = await query;

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      return NextResponse.json(
        { error: "Failed to fetch messages", messages: [] },
        { status: 500 }
      );
    }

    // Get thread reply counts
    const messageIds = (messages || []).map((m) => m.id);
    const { data: threadCounts } = await supabase
      .from("messages")
      .select("parent_message_id")
      .in("parent_message_id", messageIds);

    const threadCountMap = new Map<string, number>();
    (threadCounts || []).forEach((t) => {
      if (t.parent_message_id) {
        threadCountMap.set(
          t.parent_message_id,
          (threadCountMap.get(t.parent_message_id) || 0) + 1
        );
      }
    });

    // Get read receipts
    const { data: reads } = await supabase
      .from("message_reads")
      .select("message_id, user_id")
      .in("message_id", messageIds);

    const readByMap = new Map<string, string[]>();
    (reads || []).forEach((read) => {
      if (!readByMap.has(read.message_id)) {
        readByMap.set(read.message_id, []);
      }
      readByMap.get(read.message_id)!.push(read.user_id);
    });

    // Get sender profiles
    const senderIds = [...new Set((messages || []).map((m) => m.author_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, fullname")
      .in("id", senderIds);

    const profileMap = new Map<string, any>();
    (profiles || []).forEach((p) => {
      profileMap.set(p.id, p);
    });

    // Format messages (reverse to show oldest first)
    const formattedMessages = (messages || [])
      .reverse()
      .map((msg) => {
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
          thread_reply_count: threadCountMap.get(msg.id) || 0,
          read_by: readByMap.get(msg.id) || [],
          file_url: msg.file_url || null,
          file_name: msg.file_name || null,
          file_type: msg.file_type || null,
          file_size: msg.file_size || null,
        };
      });

    return NextResponse.json({ messages: formattedMessages });
  } catch (error) {
    console.error("Error in messages/[conversationId] GET API route:", error);
    return NextResponse.json(
      { error: "Internal server error", messages: [] },
      { status: 500 }
    );
  }
}

// POST: Send a message
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
    const body = await request.json();
    const { content, parent_message_id, file_url, file_name, file_type, file_size } = body;

    // Content is required unless a file is attached
    const hasContent = content && typeof content === "string" && content.trim().length > 0;
    const hasFile = file_url && file_name;

    if (!hasContent && !hasFile) {
      return NextResponse.json(
        { error: "Message content or file attachment is required" },
        { status: 400 }
      );
    }

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

    // If parent_message_id is provided, verify it exists and is in the same conversation
    if (parent_message_id) {
      const { data: parentMessage } = await supabase
        .from("messages")
        .select("conversation_id")
        .eq("id", parent_message_id)
        .single();

      if (!parentMessage || parentMessage.conversation_id !== conversationId) {
        return NextResponse.json(
          { error: "Invalid parent message" },
          { status: 400 }
        );
      }
    }

    // Create message
    const { data: message, error: messageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        author_id: user.id,
        content: hasContent ? content.trim() : "",
        parent_message_id: parent_message_id || null,
        file_url: file_url || null,
        file_name: file_name || null,
        file_type: file_type || null,
        file_size: file_size || null,
      })
      .select()
      .single();

    if (messageError || !message) {
      console.error("Error creating message:", messageError);
      return NextResponse.json(
        { error: "Failed to send message" },
        { status: 500 }
      );
    }

    // Update conversation updated_at
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    // Get sender profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, fullname")
      .eq("id", user.id)
      .single();

    // Parse mentions and create notifications
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[1]);
    }

    // Create notifications for mentioned users (if any)
    if (mentions.length > 0) {
      // Get all participants in the conversation
      const { data: conversationParticipants } = await supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", conversationId);

      const participantIds = conversationParticipants?.map((p) => p.user_id) || [];

      // Get profiles to match mentions
      const { data: participantProfiles } = await supabase
        .from("profiles")
        .select("id, email, fullname")
        .in("id", participantIds)
        .neq("id", user.id); // Don't notify the sender

      // Match mentions to users
      const mentionedUsers: string[] = [];
      (participantProfiles || []).forEach((profile) => {
        const emailPrefix = profile.email?.split("@")[0].toLowerCase() || "";
        const fullname = (profile.fullname || "").toLowerCase();

        mentions.forEach((mention) => {
          const mentionLower = mention.toLowerCase();
          if (
            emailPrefix === mentionLower ||
            fullname.split(" ").some((part: string) => part === mentionLower || part.startsWith(mentionLower))
          ) {
            if (!mentionedUsers.includes(profile.email)) {
              mentionedUsers.push(profile.email);
            }
          }
        });
      });

      // Create notifications for mentioned users
      // Note: Using 'reminder_assigned' type as it's available in the schema
      // For MVP, this works. Can add 'message_mention' type later if needed
      if (mentionedUsers.length > 0) {
        const { data: senderProfile } = await supabase
          .from("profiles")
          .select("email, fullname")
          .eq("id", user.id)
          .single();

        const senderName = senderProfile?.fullname || senderProfile?.email || "Someone";

        const notificationInserts = mentionedUsers.map((userEmail) => ({
          user_email: userEmail,
          type: "reminder_assigned", // Using existing type for MVP
          title: "You were mentioned",
          message: `${senderName} mentioned you in a message`,
          reminder_id: null,
          read: false,
        }));

        await supabase.from("notifications").insert(notificationInserts);
      }
    }

    return NextResponse.json({
      message: {
        id: message.id,
        conversation_id: message.conversation_id,
        author_id: message.author_id,
        author_email: profile?.email || "",
        author_fullname: profile?.fullname || null,
        content: message.content,
        created_at: message.created_at,
        parent_message_id: message.parent_message_id,
        thread_reply_count: 0,
        read_by: [],
        file_url: message.file_url || null,
        file_name: message.file_name || null,
        file_type: message.file_type || null,
        file_size: message.file_size || null,
      },
    });
  } catch (error) {
    console.error("Error in messages/[conversationId] POST API route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

