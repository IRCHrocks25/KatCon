import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { moderateRateLimit } from "@/lib/utils/rate-limit";
import { validateRequestBody, sanitizeString, ValidationSchemas, isValidUUID } from "@/lib/utils/validation";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

interface DatabaseMessage {
  id: string;
  conversation_id: string;
  author_id: string;
  content: string;
  created_at: string;
  parent_message_id: string | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
}

interface ThreadCountResult {
  parent_message_id: string;
}

interface ReadResult {
  message_id: string;
  user_id: string;
}

interface ReactionResult {
  id: string;
  message_id: string;
  user_id: string;
  reaction_type: string;
  created_at: string;
}

interface ProfileResult {
  id: string;
  email: string;
  fullname: string | null;
  username: string | null;
  avatar_url: string | null;
}

interface ConversationParticipantResult {
  user_id: string;
}

interface MentionProfileResult {
  id: string;
  email: string;
  fullname: string | null;
}

// GET: Get messages for a conversation
async function getMessagesHandler(
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
    const searchQuery = searchParams.get("search");
    const limit = Math.min(parseInt(searchParams.get("limit") || "30", 10), 100);

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

    // Optimized approach: Reduce N+1 queries by batching operations
    // This reduces from 6 separate queries to 4 batched queries
    let query = supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .is("parent_message_id", null) // Only top-level messages
      .order("created_at", { ascending: false });

    // If search query is provided, filter by content
    if (searchQuery && searchQuery.trim()) {
      query = query.ilike("content", `%${searchQuery.trim()}%`);
      // For search, use a higher limit to get more results
      query = query.limit(Math.min(limit * 3, 200));
    } else {
      query = query.limit(limit);
    }

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

    // Early return if no messages
    if (!messages || messages.length === 0) {
      return NextResponse.json({
        messages: [],
        hasMore: false
      });
    }

    const messageIds = messages.map((m: DatabaseMessage) => m.id);
    const senderIds = [...new Set(messages.map((m: DatabaseMessage) => m.author_id))];

    // Batch all related data queries in parallel
    const [
      threadCountsResult,
      readsResult,
      reactionsResult,
      profilesResult,
      pinnedMessagesResult
    ] = await Promise.all([
      // Get thread reply counts for all messages at once
      supabase
        .from("messages")
        .select("parent_message_id")
        .in("parent_message_id", messageIds),

      // Get read receipts for all messages at once
      supabase
        .from("message_reads")
        .select("message_id, user_id")
        .in("message_id", messageIds),

      // Get reactions for all messages at once
      supabase
        .from("message_reactions")
        .select("id, message_id, user_id, reaction_type, created_at")
        .in("message_id", messageIds)
        .order("created_at", { ascending: true }),

      // Get all sender profiles at once
      supabase
        .from("profiles")
        .select("id, email, fullname, username, avatar_url")
        .in("id", senderIds),

      // Get pinned messages for this conversation
      supabase
        .from("pinned_messages")
        .select("message_id")
        .eq("conversation_id", conversationId)
        .is("unpinned_at", null)
    ]);

    // Process thread counts
    const threadCountMap = new Map<string, number>();
    (threadCountsResult.data || []).forEach((t: ThreadCountResult) => {
      if (t.parent_message_id) {
        threadCountMap.set(
          t.parent_message_id,
          (threadCountMap.get(t.parent_message_id) || 0) + 1
        );
      }
    });

    // Process read receipts
    const readByMap = new Map<string, string[]>();
    (readsResult.data || []).forEach((read: ReadResult) => {
      if (!readByMap.has(read.message_id)) {
        readByMap.set(read.message_id, []);
      }
      readByMap.get(read.message_id)!.push(read.user_id);
    });

    // Process reactions
    const reactionUserIds = reactionsResult.data
      ? [...new Set(reactionsResult.data.map((r: ReactionResult) => r.user_id))]
      : [];

    const reactionProfilesResult = reactionUserIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, email, fullname, username, avatar_url")
          .in("id", reactionUserIds)
      : { data: null };

    const reactionProfileMap = new Map<string, ProfileResult>();
    (reactionProfilesResult.data || []).forEach((p: ProfileResult) => {
      reactionProfileMap.set(p.id, p);
    });

    const reactionsByMessage = new Map<string, Map<string, Array<{
      id: string;
      userId: string;
      userEmail: string;
      userFullname: string | null;
      userAvatarUrl: string | null;
      createdAt: string;
    }>>>();
    (reactionsResult.data || []).forEach((reaction: ReactionResult) => {
      if (!reactionsByMessage.has(reaction.message_id)) {
        reactionsByMessage.set(reaction.message_id, new Map());
      }
      const messageReactions = reactionsByMessage.get(reaction.message_id)!;
      if (!messageReactions.has(reaction.reaction_type)) {
        messageReactions.set(reaction.reaction_type, []);
      }
      const profile = reactionProfileMap.get(reaction.user_id);
      messageReactions.get(reaction.reaction_type)!.push({
        id: reaction.id,
        userId: reaction.user_id,
        userEmail: profile?.email || "",
        userFullname: profile?.fullname || null,
        userAvatarUrl: profile?.avatar_url || null,
        createdAt: reaction.created_at,
      });
    });

    // Create profile map
    const profileMap = new Map<string, ProfileResult>();
    (profilesResult.data || []).forEach((p: ProfileResult) => {
      profileMap.set(p.id, p);
    });

    // Create pinned messages set for quick lookup
    const pinnedMessageIds = new Set<string>();
    (pinnedMessagesResult.data || []).forEach((pm: { message_id: string }) => {
      pinnedMessageIds.add(pm.message_id);
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
          author_username: profile?.username || null,
          author_avatar_url: profile?.avatar_url || null,
          content: msg.content,
          created_at: msg.created_at,
          parent_message_id: msg.parent_message_id,
          thread_reply_count: threadCountMap.get(msg.id) || 0,
          read_by: readByMap.get(msg.id) || [],
          file_url: msg.file_url || null,
          file_name: msg.file_name || null,
          file_type: msg.file_type || null,
          file_size: msg.file_size || null,
          is_pinned: pinnedMessageIds.has(msg.id),
          reactions: (() => {
            const messageReactions = reactionsByMessage.get(msg.id);
            if (!messageReactions || messageReactions.size === 0) {
              return [];
            }
            return Array.from(messageReactions.entries()).map(
              ([type, users]) => ({
                type,
                count: users.length,
                users: users.map((u) => ({
                  id: u.userId,
                  email: u.userEmail,
                  fullname: u.userFullname,
                  avatarUrl: u.userAvatarUrl,
                })),
                currentUserReacted: users.some((u) => u.userId === user.id),
              })
            );
          })(),
        };
      });

    // Check if there are more messages (if we got exactly the limit, there might be more)
    const hasMore = (messages || []).length === limit;

    return NextResponse.json({ 
      messages: formattedMessages,
      hasMore 
    });
  } catch (error) {
    console.error("Error in messages/[conversationId] GET API route:", error);
    return NextResponse.json(
      { error: "Internal server error", messages: [] },
      { status: 500 }
    );
  }
}

// POST: Send a message
async function sendMessageHandler(
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

    // Validate conversation ID
    if (!isValidUUID(conversationId)) {
      return NextResponse.json(
        { error: "Invalid conversation ID" },
        { status: 400 }
      );
    }

    // Validate and sanitize request body
    const validation = await validateRequestBody(request, {
      content: {
        type: 'string',
        sanitizer: (value: unknown) => typeof value === 'string' ? sanitizeString(value, ValidationSchemas.messageContent) : value,
      },
      parent_message_id: {
        type: 'string',
        validator: (value: unknown) => typeof value === 'string' && (!value || isValidUUID(value)),
      },
      file_url: {
        type: 'string',
      },
      file_name: {
        type: 'string',
        sanitizer: (value: unknown) => typeof value === 'string' ? sanitizeString(value, ValidationSchemas.fileName) : value,
      },
      file_type: {
        type: 'string',
      },
      file_size: {
        type: 'number',
        validator: (value: unknown) => typeof value === 'number' && value > 0 && value <= 10 * 1024 * 1024, // 10MB max
      },
    });

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status }
      );
    }

    const { content, parent_message_id, file_url, file_name, file_type, file_size } = validation.data;

    // Content is required unless a file is attached
    const hasContent = content && typeof content === 'string' && content.trim().length > 0;
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
      .select("email, fullname, username, avatar_url")
      .eq("id", user.id)
      .single();

    // Parse mentions and create notifications
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;
    if (typeof content === 'string') {
      while ((match = mentionRegex.exec(content)) !== null) {
        mentions.push(match[1]);
      }
    }

    // Create notifications for mentioned users (if any)
    if (mentions.length > 0) {
      // Get all participants in the conversation
      const { data: conversationParticipants } = await supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", conversationId);

      const participantIds = conversationParticipants?.map((p: ConversationParticipantResult) => p.user_id) || [];

      // Get profiles to match mentions
      const { data: participantProfiles } = await supabase
        .from("profiles")
        .select("id, email, fullname")
        .in("id", participantIds)
        .neq("id", user.id); // Don't notify the sender

      // Match mentions to users
      const mentionedUsers: string[] = [];
      (participantProfiles || []).forEach((profile: MentionProfileResult) => {
        const emailPrefix = profile.email?.split("@")[0].toLowerCase() || "";
        const fullname = (profile.fullname || "").toLowerCase();

        mentions.forEach((mention: string) => {
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
        author_username: profile?.username || null,
        author_avatar_url: profile?.avatar_url || null,
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

// Export rate-limited handlers
export const GET = moderateRateLimit(getMessagesHandler);
export const POST = moderateRateLimit(sendMessageHandler);