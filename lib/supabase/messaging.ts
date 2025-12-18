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

export interface Message {
  id: string;
  conversationId: string;
  authorId: string;
  authorEmail: string;
  authorFullname?: string | null;
  content: string;
  createdAt: Date;
  parentMessageId?: string | null;
  threadReplyCount?: number;
  readBy: string[];
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
    return (data.conversations || []).map((conv: any) => ({
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
      participants: conv.participants || [],
      lastMessage: conv.last_message
        ? {
            id: conv.last_message.id,
            conversationId: conv.last_message.conversation_id,
            authorId: conv.last_message.author_id,
            authorEmail: conv.last_message.author_email || "",
            authorFullname: conv.last_message.author_fullname,
            content: conv.last_message.content,
            createdAt: new Date(conv.last_message.created_at),
            readBy: [],
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
  beforeMessageId?: string
): Promise<Message[]> {
  try {
    const headers = await getAuthHeaders();
    const url = beforeMessageId
      ? `/api/messaging/messages/${conversationId}?before=${beforeMessageId}`
      : `/api/messaging/messages/${conversationId}`;

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
    return (data.messages || []).map((msg: any) => ({
      id: msg.id,
      conversationId: msg.conversation_id,
      authorId: msg.author_id,
      authorEmail: msg.author_email || "",
      authorFullname: msg.author_fullname,
      content: msg.content,
      createdAt: new Date(msg.created_at),
      parentMessageId: msg.parent_message_id,
      threadReplyCount: msg.thread_reply_count || 0,
      readBy: msg.read_by || [],
    }));
  } catch (error) {
    if (isDev) console.error("Error in getMessages:", error);
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
    return (data.messages || []).map((msg: any) => ({
      id: msg.id,
      conversationId: msg.conversation_id,
      authorId: msg.author_id,
      authorEmail: msg.author_email || "",
      authorFullname: msg.author_fullname,
      content: msg.content,
      createdAt: new Date(msg.created_at),
      parentMessageId: msg.parent_message_id,
      threadReplyCount: 0,
      readBy: msg.read_by || [],
    }));
  } catch (error) {
    if (isDev) console.error("Error in getThreadMessages:", error);
    throw error;
  }
}

/**
 * Send a message to a conversation or reply to a thread
 */
export async function sendMessage(
  conversationId: string,
  content: string,
  parentMessageId?: string
): Promise<Message | null> {
  try {
    const headers = await getAuthHeaders();
    const response = await robustFetch(
      `/api/messaging/messages/${conversationId}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          content: content.trim(),
          parent_message_id: parentMessageId || null,
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

    return {
      id: data.message.id,
      conversationId: data.message.conversation_id,
      authorId: data.message.author_id,
      authorEmail: data.message.author_email || "",
      authorFullname: data.message.author_fullname,
      content: data.message.content,
      createdAt: new Date(data.message.created_at),
      parentMessageId: data.message.parent_message_id,
      threadReplyCount: 0,
      readBy: [],
    };
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

