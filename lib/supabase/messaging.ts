import { supabase } from "./client";
import { robustFetch } from "@/lib/utils/fetch";

const isDev = process.env.NODE_ENV === "development";

async function getAuthHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  return headers;
}

export interface ConversationParticipant {
  userId: string;
  email: string;
  fullname?: string;
  avatarUrl?: string;
  username?: string;
}

export interface Conversation {
  id: string;
  name: string | null;
  description?: string | null;
  type: "channel" | "dm";
  isPrivate: boolean;
  /**
   * Whether the current user is a participant in this conversation.
   * For DMs and private channels this will almost always be true.
   * For public channels, this can be false when the user has not joined yet.
   */
  isJoined?: boolean;
  /**
   * User ID of the creator/owner of the conversation (if available).
   * Only the creator is allowed to manage channel membership.
   */
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  participants: ConversationParticipant[];
  lastMessage?: Message;
  unreadCount?: number;
}

export interface MessageReaction {
  type: string;
  count: number;
  users: Array<{
    id: string;
    email: string;
    fullname?: string | null;
    avatarUrl?: string | null;
  }>;
  currentUserReacted: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  authorId: string;
  authorEmail: string;
  authorFullname?: string | null;
  authorAvatarUrl?: string | null;
  authorUsername?: string | null;
  content: string;
  createdAt: Date;
  parentMessageId?: string | null;
  threadReplyCount?: number;
  readBy: string[];
  // File attachment fields
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  // Reactions
  reactions?: MessageReaction[];
  isPinned?: boolean;
}

// Raw API response types for type-safe mapping
interface RawConversationData {
  id: string;
  name: string | null;
  description: string | null;
  type: string;
  is_private: boolean;
  is_joined?: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
  participants?: RawParticipantData[];
  last_message?: RawMessageData | null;
  unread_count?: number;
}

interface RawParticipantData {
  userId?: string;
  user_id?: string;
  email: string;
  fullname?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  avatar_url?: string | null;
}

interface RawMessageData {
  id: string;
  conversation_id: string;
  author_id: string;
  author_email: string;
  author_fullname?: string | null;
  author_username?: string | null;
  author_avatar_url?: string | null;
  content: string;
  created_at: string;
  parent_message_id?: string | null;
  thread_reply_count?: number;
  read_by?: string[];
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  is_pinned?: boolean;
  reactions?: MessageReaction[];
}

interface RawPinnedMessageData {
  id: string;
  messageId: string;
  message: {
    id: string;
    content: string;
    createdAt: string;
    author: {
      id: string;
      email: string;
      fullname?: string | null;
      username?: string | null;
      avatarUrl?: string | null;
    };
  };
  pinnedBy: {
    id: string;
    email: string;
    fullname?: string | null;
  };
  pinnedAt: string;
}

interface RawUserStatusData {
  statusText: string | null;
  statusEmoji: string | null;
  expiresAt: string | null;
  updatedAt: string;
}

/**
 * Get all conversations for the current user (channels + DMs)
 */
export async function getConversations(): Promise<Conversation[]> {
  try {
    const headers = await getAuthHeaders();
    const response = await robustFetch("/api/messaging/conversations", {
      method: "GET",
      headers,
      retries: 2,
      timeout: 10000,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to fetch conversations");
    }

    const data = await response.json();
    return (data.conversations || []).map((conv: RawConversationData) => ({
      id: conv.id,
      name: conv.name,
      description: conv.description,
      type: conv.type as "channel" | "dm",
      isPrivate: Boolean(conv.is_private),
      isJoined:
        typeof conv.is_joined === "boolean"
          ? conv.is_joined
          : // For backwards compatibility, assume joined unless explicitly false
            true,
      createdBy: conv.created_by || undefined,
      createdAt: new Date(conv.created_at),
      updatedAt: new Date(conv.updated_at),
      participants: (conv.participants || []).map((p: RawParticipantData) => ({
        userId: p.userId || p.user_id,
        email: p.email || "",
        fullname: p.fullname || null,
        username: p.username || null,
        avatarUrl: p.avatarUrl || p.avatar_url || null,
      })),
      lastMessage: conv.last_message
        ? {
            id: conv.last_message.id,
            conversationId: conv.last_message.conversation_id,
            authorId: conv.last_message.author_id,
            authorEmail: conv.last_message.author_email || "",
            authorFullname: conv.last_message.author_fullname,
            authorUsername: conv.last_message.author_username || null,
            authorAvatarUrl: conv.last_message.author_avatar_url || null,
            content: conv.last_message.content,
            createdAt: new Date(conv.last_message.created_at),
            readBy: [],
            fileUrl: conv.last_message.file_url || null,
            fileName: conv.last_message.file_name || null,
            fileType: conv.last_message.file_type || null,
            fileSize: conv.last_message.file_size || null,
          }
        : undefined,
      unreadCount: conv.unread_count || 0,
    }));
  } catch (error) {
    if (isDev) console.error("Error in getConversations:", error);
    throw error;
  }
}

/**
 * Get messages for a conversation with pagination
 */
export async function getMessages(
  conversationId: string,
  beforeMessageId?: string,
  limit: number = 30,
  searchQuery?: string
): Promise<{ messages: Message[]; hasMore: boolean }> {
  try {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (beforeMessageId) params.set("before", beforeMessageId);
    if (searchQuery) params.set("search", searchQuery);
    params.set("limit", limit.toString());
    
    const url = `/api/messaging/messages/${conversationId}?${params.toString()}`;

    const response = await robustFetch(url, {
      method: "GET",
      headers,
      retries: 2,
      timeout: 10000,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to fetch messages");
    }

    const data = await response.json();
    return {
      messages: (data.messages || []).map((msg: RawMessageData) => ({
        id: msg.id,
        conversationId: msg.conversation_id,
        authorId: msg.author_id,
        authorEmail: msg.author_email || "",
        authorFullname: msg.author_fullname,
        authorUsername: msg.author_username || null,
        authorAvatarUrl: msg.author_avatar_url || null,
        content: msg.content,
        createdAt: new Date(msg.created_at),
        parentMessageId: msg.parent_message_id,
        threadReplyCount: msg.thread_reply_count || 0,
        readBy: msg.read_by || [],
        fileUrl: msg.file_url || null,
        fileName: msg.file_name || null,
        fileType: msg.file_type || null,
        fileSize: msg.file_size || null,
        isPinned: msg.is_pinned || false,
        reactions: (msg.reactions || []) as MessageReaction[],
      })),
      hasMore: data.hasMore || false,
    };
  } catch (error) {
    if (isDev) console.error("Error in getMessages:", error);
    throw error;
  }
}

/**
 * Search messages in a conversation
 */
export async function searchMessages(
  conversationId: string,
  searchQuery: string,
  limit: number = 100
): Promise<Message[]> {
  try {
    const { messages } = await getMessages(conversationId, undefined, limit, searchQuery);
    return messages;
  } catch (error) {
    if (isDev) console.error("Error in searchMessages:", error);
    throw error;
  }
}

/**
 * Get messages around a specific message ID (for scrolling to unloaded messages)
 * Fetches a large batch of messages and returns context around the target
 */
export async function getMessagesAround(
  conversationId: string,
  messageId: string,
  contextSize: number = 20
): Promise<Message[]> {
  try {
    // Fetch a large batch of messages to ensure we get the target
    const { messages: allMessages } = await getMessages(conversationId, undefined, 200);
    
    // Find target message in results
    const targetIndex = allMessages.findIndex((m) => m.id === messageId);
    
    if (targetIndex === -1) {
      // Target not found in first batch, try fetching more
      // For now, return empty - in production you might want to implement
      // a more sophisticated search (e.g., binary search by timestamp)
      console.warn(`Message ${messageId} not found in conversation ${conversationId}`);
      return [];
    }

    // Return context around target (messages before and after)
    const start = Math.max(0, targetIndex - contextSize);
    const end = Math.min(allMessages.length, targetIndex + contextSize + 1);
    return allMessages.slice(start, end);
  } catch (error) {
    if (isDev) console.error("Error in getMessagesAround:", error);
    throw error;
  }
}

/**
 * Get thread messages (replies to a parent message)
 */
export async function getThreadMessages(
  parentMessageId: string
): Promise<Message[]> {
  try {
    const headers = await getAuthHeaders();
    const response = await robustFetch(
      `/api/messaging/threads/${parentMessageId}`,
      {
        method: "GET",
        headers,
        retries: 2,
        timeout: 10000,
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to fetch thread messages");
    }

    const data = await response.json();
    return (data.messages || []).map((msg: RawMessageData) => ({
      id: msg.id,
      conversationId: msg.conversation_id,
      authorId: msg.author_id,
      authorEmail: msg.author_email || "",
      authorFullname: msg.author_fullname,
      authorUsername: msg.author_username || null,
      authorAvatarUrl: msg.author_avatar_url || null,
      content: msg.content,
      createdAt: new Date(msg.created_at),
      parentMessageId: msg.parent_message_id,
      threadReplyCount: 0,
      readBy: msg.read_by || [],
      fileUrl: msg.file_url || null,
      fileName: msg.file_name || null,
      fileType: msg.file_type || null,
      fileSize: msg.file_size || null,
    }));
  } catch (error) {
    if (isDev) console.error("Error in getThreadMessages:", error);
    throw error;
  }
}

export interface FileAttachment {
  url: string;
  name: string;
  type: string;
  size: number;
}

/**
 * Send a message to a conversation or reply to a thread
 */
export async function sendMessage(
  conversationId: string,
  content: string,
  parentMessageId?: string,
  fileAttachment?: FileAttachment
): Promise<Message | null> {
  try {
    const headers = await getAuthHeaders();
    const trimmedContent = content.trim();

    const response = await robustFetch(
      `/api/messaging/messages/${conversationId}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          content: trimmedContent,
          parent_message_id: parentMessageId || null,
          file_url: fileAttachment?.url || null,
          file_name: fileAttachment?.name || null,
          file_type: fileAttachment?.type || null,
          file_size: fileAttachment?.size || null,
        }),
        retries: 0, // No retries for POST to prevent duplicates
        timeout: 15000,
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to send message");
    }

    const data = await response.json();
    if (!data.message) return null;

    const sentMessage = {
      id: data.message.id,
      conversationId: data.message.conversation_id,
      authorId: data.message.author_id,
      authorEmail: data.message.author_email || "",
      authorFullname: data.message.author_fullname,
      authorUsername: data.message.author_username || null,
      authorAvatarUrl: data.message.author_avatar_url || null,
      content: data.message.content,
      createdAt: new Date(data.message.created_at),
      parentMessageId: data.message.parent_message_id,
      threadReplyCount: 0,
      readBy: [],
      fileUrl: data.message.file_url || null,
      fileName: data.message.file_name || null,
      fileType: data.message.file_type || null,
      fileSize: data.message.file_size || null,
    };

    // Process @everyone mentions after message is sent
    const hasEveryoneMention = trimmedContent.toLowerCase().includes("@everyone");

    if (hasEveryoneMention) {
      // Get conversation details to check if it's a channel
      const conversations = await getConversations();
      const conversation = conversations.find(c => c.id === conversationId);

      // Only process @everyone for channels (not DMs)
      if (conversation && conversation.type === "channel") {
        console.log("[MENTIONS] @everyone mention detected in channel:", conversationId);

        try {
          // Get current user info
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error("User not authenticated");

          // Get all participants in the channel
          const participants = conversation.participants.filter(p => p.userId !== user.id);

          if (participants.length > 0) {
            console.log(`[MENTIONS] Creating notifications for ${participants.length} participants`);

            // Create notifications for all participants
            const notificationPromises = participants.map(async (participant) => {
              try {
                const notificationHeaders = await getAuthHeaders();
                return await robustFetch("/api/notifications/everyone", {
                  method: "POST",
                  headers: notificationHeaders,
                  body: JSON.stringify({
                    conversationId,
                    messageId: sentMessage.id, // Now we have the actual message ID
                    mentionedBy: user.email,
                    channelName: conversation.name || "Unnamed Channel",
                  }),
                  retries: 0,
                  timeout: 5000,
                });
              } catch (error) {
                console.error(`[MENTIONS] Failed to create notification for ${participant.email}:`, error);
                return null;
              }
            });

            // Send notifications in background (don't await)
            Promise.all(notificationPromises)
              .then((results) => {
                const successCount = results.filter(r => r && r.ok).length;
                console.log(`[MENTIONS] Successfully created ${successCount}/${participants.length} @everyone notifications`);
              })
              .catch((error) => {
                console.error("[MENTIONS] Error creating @everyone notifications:", error);
              });
          }
        } catch (error) {
          console.error("[MENTIONS] Error processing @everyone mentions:", error);
          // Continue - message was sent successfully, notifications are secondary
        }
      }
    }

    return sentMessage;
  } catch (error) {
    if (isDev) console.error("Error in sendMessage:", error);
    throw error;
  }
}

/**
 * Create a new channel
 */
export async function createChannel(
  name: string,
  description: string | null,
  isPrivate: boolean,
  participantIds: string[]
): Promise<Conversation | null> {
  try {
    const headers = await getAuthHeaders();
    const response = await robustFetch("/api/messaging/conversations", {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "channel",
        name: name.trim(),
        description: description?.trim() || null,
        is_private: isPrivate,
        participant_ids: participantIds,
      }),
      retries: 0,
      timeout: 15000,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to create channel");
    }

    const data = await response.json();
    if (!data.conversation) return null;

    const conv = data.conversation;
    return {
      id: conv.id,
      name: conv.name,
      description: conv.description,
      type: conv.type as "channel" | "dm",
      isPrivate: Boolean(conv.is_private),
      isJoined: true,
      createdBy: conv.created_by || undefined,
      createdAt: new Date(conv.created_at),
      updatedAt: new Date(conv.updated_at),
      participants: conv.participants || [],
      unreadCount: 0,
    };
  } catch (error) {
    if (isDev) console.error("Error in createChannel:", error);
    throw error;
  }
}

/**
 * Create or get existing DM conversation with another user
 */
export async function createDM(userId: string): Promise<Conversation | null> {
  try {
    const headers = await getAuthHeaders();
    const response = await robustFetch("/api/messaging/conversations", {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "dm",
        participant_ids: [userId],
      }),
      retries: 0,
      timeout: 15000,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to create DM");
    }

    const data = await response.json();
    if (!data.conversation) return null;

    const conv = data.conversation;
    return {
      id: conv.id,
      name: conv.name,
      description: conv.description,
      type: conv.type as "channel" | "dm",
      isPrivate: Boolean(conv.is_private),
      isJoined: true,
      createdBy: conv.created_by || undefined,
      createdAt: new Date(conv.created_at),
      updatedAt: new Date(conv.updated_at),
      participants: conv.participants || [],
      unreadCount: 0,
    };
  } catch (error) {
    if (isDev) console.error("Error in createDM:", error);
    throw error;
  }
}

/**
 * Parse @mentions from message content
 */
export function parseMentions(content: string): string[] {
  const mentionRegex = /@(\w+)/g;
  const mentions: string[] = [];
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1]);
  }

  return [...new Set(mentions)]; // Remove duplicates
}

/**
 * Mark conversation as read
 */
export async function markAsRead(conversationId: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    const response = await robustFetch(
      `/api/messaging/read/${conversationId}`,
      {
        method: "POST",
        headers,
        retries: 0,
        timeout: 10000,
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (isDev) console.error("Error marking as read:", errorData);
    }
  } catch (error) {
    if (isDev) console.error("Error in markAsRead:", error);
    // Don't throw - this is a non-critical operation
  }
}

/**
 * Get unread message count for a conversation
 */
export async function getUnreadCount(
  conversationId: string
): Promise<number> {
  try {
    const headers = await getAuthHeaders();
    const response = await robustFetch(
      `/api/messaging/conversations/${conversationId}`,
      {
        method: "GET",
        headers,
        retries: 2,
        timeout: 10000,
      }
    );

    if (!response.ok) {
      return 0;
    }

    const data = await response.json();
    return data.conversation?.unread_count || 0;
  } catch (error) {
    if (isDev) console.error("Error in getUnreadCount:", error);
    return 0;
  }
}

/**
 * Join a channel as the current user.
 * Typically used for public channels where the user is not yet a participant.
 */
export async function joinChannel(conversationId: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    const response = await robustFetch(
      `/api/messaging/conversations/${conversationId}/participants`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({}),
        retries: 0,
        timeout: 10000,
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to join channel");
    }
  } catch (error) {
    if (isDev) console.error("Error in joinChannel:", error);
    throw error;
  }
}

/**
 * Leave a channel as the current user.
 */
export async function leaveChannel(conversationId: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    const response = await robustFetch(
      `/api/messaging/conversations/${conversationId}/participants`,
      {
        method: "DELETE",
        headers,
        body: JSON.stringify({}),
        retries: 0,
        timeout: 10000,
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to leave channel");
    }
  } catch (error) {
    if (isDev) console.error("Error in leaveChannel:", error);
    throw error;
  }
}

/**
 * Add a participant to a channel (admin/owner only).
 */
export async function addChannelParticipant(
  conversationId: string,
  userId: string
): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    const response = await robustFetch(
      `/api/messaging/conversations/${conversationId}/participants`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ user_id: userId }),
        retries: 0,
        timeout: 10000,
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to add participant");
    }
  } catch (error) {
    if (isDev) console.error("Error in addChannelParticipant:", error);
    throw error;
  }
}

/**
 * Remove a participant from a channel (admin/owner only, or self-remove).
 */
export async function removeChannelParticipant(
  conversationId: string,
  userId: string
): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    const response = await robustFetch(
      `/api/messaging/conversations/${conversationId}/participants`,
      {
        method: "DELETE",
        headers,
        body: JSON.stringify({ user_id: userId }),
        retries: 0,
        timeout: 10000,
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to remove participant");
    }
  } catch (error) {
    if (isDev) console.error("Error in removeChannelParticipant:", error);
    throw error;
  }
}

/**
 * Delete a channel (creator only). Removes all participants and messages.
 */
export async function deleteChannel(conversationId: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    const response = await robustFetch(
      `/api/messaging/conversations/${conversationId}`,
      {
        method: "DELETE",
        headers,
        retries: 0,
        timeout: 15000,
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to delete channel");
    }
  } catch (error) {
    if (isDev) console.error("Error in deleteChannel:", error);
    throw error;
  }
}

// ==================== Message Reactions ====================

export interface MessageReactionResponse {
  reactions: MessageReaction[];
}

/**
 * Get reactions for a message
 */
export async function getMessageReactions(
  messageId: string
): Promise<MessageReaction[]> {
  try {
    const headers = await getAuthHeaders();
    const response = await robustFetch(
      `/api/messaging/reactions?messageId=${messageId}`,
      {
        method: "GET",
        headers,
        retries: 2,
        timeout: 10000,
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to fetch reactions");
    }

    const data: MessageReactionResponse = await response.json();
    return data.reactions || [];
  } catch (error) {
    if (isDev) console.error("Error in getMessageReactions:", error);
    throw error;
  }
}

/**
 * Toggle a reaction on a message
 */
export async function toggleMessageReaction(
  messageId: string,
  reactionType: string
): Promise<{ action: "added" | "removed"; reactionType: string }> {
  try {
    const headers = await getAuthHeaders();
    const response = await robustFetch("/api/messaging/reactions", {
      method: "POST",
      headers,
      body: JSON.stringify({ messageId, reactionType }),
      retries: 2,
      timeout: 10000,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to toggle reaction");
    }

    return await response.json();
  } catch (error) {
    if (isDev) console.error("Error in toggleMessageReaction:", error);
    throw error;
  }
}

// ==================== Pinned Messages ====================

export interface PinnedMessage {
  id: string;
  messageId: string;
  message: {
    id: string;
    content: string;
    createdAt: string;
    author: {
      id: string;
      email: string;
      fullname?: string | null;
      username?: string | null;
      avatarUrl?: string | null;
    };
  };
  pinnedBy: {
    id: string;
    email: string;
    fullname?: string | null;
  };
  pinnedAt: string;
}

/**
 * Get pinned messages for a conversation
 */
export async function getPinnedMessages(
  conversationId: string
): Promise<PinnedMessage[]> {
  try {
    const headers = await getAuthHeaders();
    const response = await robustFetch(
      `/api/messaging/pinned?conversationId=${conversationId}`,
      {
        method: "GET",
        headers,
        retries: 2,
        timeout: 10000,
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to fetch pinned messages");
    }

    const data = await response.json();
    return data.pinnedMessages || [];
  } catch (error) {
    if (isDev) console.error("Error in getPinnedMessages:", error);
    throw error;
  }
}

/**
 * Pin a message
 */
export async function pinMessage(
  messageId: string
): Promise<{ pinnedMessage: RawPinnedMessageData }> {
  try {
    const headers = await getAuthHeaders();
    const response = await robustFetch("/api/messaging/pinned", {
      method: "POST",
      headers,
      body: JSON.stringify({ messageId }),
      retries: 2,
      timeout: 10000,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to pin message");
    }

    return await response.json();
  } catch (error) {
    if (isDev) console.error("Error in pinMessage:", error);
    throw error;
  }
}

/**
 * Unpin a message
 */
export async function unpinMessage(messageId: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    const response = await robustFetch(
      `/api/messaging/pinned?messageId=${messageId}`,
      {
        method: "DELETE",
        headers,
        retries: 2,
        timeout: 10000,
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to unpin message");
    }
  } catch (error) {
    if (isDev) console.error("Error in unpinMessage:", error);
    throw error;
  }
}

// ==================== User Status ====================

export interface UserStatus {
  userId: string;
  statusText?: string | null;
  statusEmoji?: string | null;
  expiresAt?: string | null;
  updatedAt: string;
}

/**
 * Get user status
 */
export async function getUserStatus(
  userId?: string
): Promise<UserStatus | null> {
  try {
    const headers = await getAuthHeaders();
    const url = userId
      ? `/api/user/status?userId=${userId}`
      : "/api/user/status";
    const response = await robustFetch(url, {
      method: "GET",
      headers,
      retries: 2,
      timeout: 10000,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to fetch user status");
    }

    const data = await response.json();
    return data.status;
  } catch (error) {
    if (isDev) console.error("Error in getUserStatus:", error);
    throw error;
  }
}

/**
 * Set user status
 */
export async function setUserStatus(
  statusText?: string | null,
  statusEmoji?: string | null,
  expiresAt?: string | null
): Promise<UserStatus | null> {
  try {
    const headers = await getAuthHeaders();
    const response = await robustFetch("/api/user/status", {
      method: "POST",
      headers,
      body: JSON.stringify({ statusText, statusEmoji, expiresAt }),
      retries: 2,
      timeout: 10000,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to set user status");
    }

    const data = await response.json();
    return data.status;
  } catch (error) {
    if (isDev) console.error("Error in setUserStatus:", error);
    throw error;
  }
}

/**
 * Get multiple user statuses (batch)
 */
export async function getUserStatuses(
  userIds: string[]
): Promise<Record<string, UserStatus>> {
  try {
    const headers = await getAuthHeaders();
    const response = await robustFetch("/api/user/status", {
      method: "PUT",
      headers,
      body: JSON.stringify({ userIds }),
      retries: 2,
      timeout: 10000,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to fetch user statuses");
    }

    const data = await response.json();
    // Convert the statuses map to UserStatus format
    const statuses: Record<string, UserStatus> = {};
    Object.entries(data.statuses || {}).forEach(([userId, status]: [string, unknown]) => {
      const userStatus = status as RawUserStatusData;
      statuses[userId] = {
        userId,
        statusText: userStatus.statusText,
        statusEmoji: userStatus.statusEmoji,
        expiresAt: userStatus.expiresAt,
        updatedAt: userStatus.updatedAt,
      };
    });
    return statuses;
  } catch (error) {
    if (isDev) console.error("Error in getUserStatuses:", error);
    throw error;
  }
}
