"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, MessageSquare, Hash } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase/client";
import {
  getConversations,
  getMessages,
  getThreadMessages,
  sendMessage,
  createChannel,
  createDM,
  markAsRead,
  type Conversation,
  type Message,
} from "@/lib/supabase/messaging";
import { ConversationList } from "./ConversationList";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ThreadPanel } from "./ThreadPanel";
import { CreateChannelModal } from "./CreateChannelModal";

// Session cache for messages (persists until logout)
interface MessageCacheEntry {
  messages: Message[];
}

export function MessagingContainer() {
  const { user: currentUser } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadParentId, setThreadParentId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);

  // Session cache for messages (persists until logout)
  const messagesCacheRef = useRef<Map<string, MessageCacheEntry>>(new Map());
  const conversationsCacheRef = useRef<Conversation[] | null>(null);

  // Use refs to avoid dependency issues in realtime subscription
  const conversationsRef = useRef<Conversation[]>([]);
  const activeConversationIdRef = useRef<string | null>(null);
  const threadParentIdRef = useRef<string | null>(null);
  const currentUserRef = useRef(currentUser);

  // Keep refs in sync
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    threadParentIdRef.current = threadParentId;
  }, [threadParentId]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Clear cache on logout
  useEffect(() => {
    if (!currentUser) {
      console.log("[MESSAGING] Clearing cache on logout");
      messagesCacheRef.current.clear();
      conversationsCacheRef.current = null;
      setConversations([]);
      setMessages([]);
      setThreadMessages([]);
      setActiveConversationId(null);
      setThreadParentId(null);
    }
  }, [currentUser]);

  // Fetch conversations with caching (only fetch if cache is empty)
  const fetchConversations = useCallback(async (forceRefresh = false) => {
    const cache = conversationsCacheRef.current;

    // Check cache first - use it if exists and not forcing refresh
    if (!forceRefresh && cache && cache.length > 0) {
      console.log("[MESSAGING] Using cached conversations");
      setConversations(cache);
      setIsLoadingConversations(false);
      return;
    }

    try {
      setIsLoadingConversations(true);
      const fetchedConversations = await getConversations();
      setConversations(fetchedConversations);

      // Update cache (persists until logout)
      conversationsCacheRef.current = fetchedConversations;
    } catch (error) {
      console.error("Error fetching conversations:", error);
      toast.error("Failed to load conversations");
    } finally {
      setIsLoadingConversations(false);
    }
  }, []);

  // Fetch messages for active conversation with caching (only fetch if cache is empty)
  const fetchMessages = useCallback(
    async (conversationId: string, forceRefresh = false) => {
      const cacheEntry = messagesCacheRef.current.get(conversationId);

      // Check cache first - use it if exists and not forcing refresh
      if (!forceRefresh && cacheEntry && cacheEntry.messages.length > 0) {
        console.log(
          "[MESSAGING] Using cached messages for conversation:",
          conversationId
        );
        setMessages(cacheEntry.messages);
        setIsLoadingMessages(false);

        // Mark as read in background (don't wait)
        markAsRead(conversationId).catch(console.error);
        return;
      }

      try {
        setIsLoadingMessages(true);
        const fetchedMessages = await getMessages(conversationId);
        setMessages(fetchedMessages);

        // Update cache (persists until logout)
        messagesCacheRef.current.set(conversationId, {
          messages: fetchedMessages,
        });

        // Mark conversation as read when viewing
        await markAsRead(conversationId);
      } catch (error) {
        console.error("Error fetching messages:", error);
        toast.error("Failed to load messages");
      } finally {
        setIsLoadingMessages(false);
      }
    },
    []
  );

  // Fetch thread messages
  const fetchThreadMessages = useCallback(async (parentMessageId: string) => {
    try {
      const fetchedThreadMessages = await getThreadMessages(parentMessageId);
      setThreadMessages(fetchedThreadMessages);
    } catch (error) {
      console.error("Error fetching thread messages:", error);
      toast.error("Failed to load thread messages");
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (currentUser) {
      fetchConversations();
    }
  }, [currentUser, fetchConversations]);

  // Load messages when conversation is selected
  useEffect(() => {
    if (activeConversationId) {
      fetchMessages(activeConversationId);
      setThreadParentId(null);
      setThreadMessages([]);
    } else {
      setMessages([]);
    }
  }, [activeConversationId, fetchMessages]);

  // Load thread messages when thread is opened
  useEffect(() => {
    if (threadParentId) {
      fetchThreadMessages(threadParentId);
    } else {
      setThreadMessages([]);
    }
  }, [threadParentId, fetchThreadMessages]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!currentUser?.id) return;

    console.log("[MESSAGING] Setting up realtime subscriptions");

    // Subscribe to new messages
    const messagesChannel = supabase
      .channel("messaging-updates")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        async (payload) => {
          console.log("[MESSAGING] New message received:", payload);

          const newMessage = payload.new as {
            id: string;
            conversation_id: string;
            author_id: string;
            content: string;
            created_at: string;
            parent_message_id?: string | null;
          };

          // Fetch sender profile
          let senderEmail = "";
          let senderFullname: string | null = null;

          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("email, fullname")
              .eq("id", newMessage.author_id)
              .single();

            if (profile) {
              senderEmail = profile.email || "";
              senderFullname = profile.fullname || null;
            }
          } catch (error) {
            console.error("Error fetching sender profile:", error);
          }

          // Create the new message object
          const newMsg: Message = {
            id: newMessage.id,
            conversationId: newMessage.conversation_id,
            authorId: newMessage.author_id,
            authorEmail: senderEmail,
            authorFullname: senderFullname,
            content: newMessage.content,
            createdAt: new Date(newMessage.created_at),
            parentMessageId: newMessage.parent_message_id,
            threadReplyCount: 0,
            readBy: [],
          };

          // Always update the cache for this conversation (even if not active)
          const cacheEntry = messagesCacheRef.current.get(
            newMessage.conversation_id
          );
          if (cacheEntry) {
            // Check if message already exists in cache
            const messageExists = cacheEntry.messages.some(
              (msg) => msg.id === newMessage.id
            );
            if (!messageExists) {
              // Add to cache (append if top-level, or insert in thread if it's a thread reply)
              if (newMessage.parent_message_id) {
                // Thread reply - we'll handle this separately when thread is open
                // For now, just update the thread reply count in the parent message
                const updatedMessages = cacheEntry.messages.map((msg) =>
                  msg.id === newMessage.parent_message_id
                    ? {
                        ...msg,
                        threadReplyCount: (msg.threadReplyCount || 0) + 1,
                      }
                    : msg
                );
                messagesCacheRef.current.set(newMessage.conversation_id, {
                  messages: updatedMessages,
                });
              } else {
                // Top-level message
                messagesCacheRef.current.set(newMessage.conversation_id, {
                  messages: [...cacheEntry.messages, newMsg],
                });
              }
            }
          } else {
            // No cache exists yet, create it with this message
            messagesCacheRef.current.set(newMessage.conversation_id, {
              messages: [newMsg],
            });
          }

          // If it's the active conversation, also update the UI state
          if (newMessage.conversation_id === activeConversationIdRef.current) {
            if (newMessage.parent_message_id) {
              // Thread reply
              if (newMessage.parent_message_id === threadParentIdRef.current) {
                // Update thread messages
                setThreadMessages((prev) => {
                  const messageExists = prev.some(
                    (msg) =>
                      msg.id === newMessage.id ||
                      (msg.content === newMessage.content &&
                        Math.abs(
                          new Date(msg.createdAt).getTime() -
                            new Date(newMessage.created_at).getTime()
                        ) < 2000)
                  );
                  if (messageExists) return prev;
                  return [...prev, newMsg];
                });
              }
              // Update thread reply count in main messages
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === newMessage.parent_message_id
                    ? {
                        ...msg,
                        threadReplyCount: (msg.threadReplyCount || 0) + 1,
                      }
                    : msg
                )
              );
            } else {
              // Top-level message
              setMessages((prev) => {
                const messageExists = prev.some(
                  (msg) =>
                    msg.id === newMessage.id ||
                    (msg.content === newMessage.content &&
                      Math.abs(
                        new Date(msg.createdAt).getTime() -
                          new Date(newMessage.created_at).getTime()
                      ) < 2000)
                );
                if (messageExists) return prev;
                return [...prev, newMsg];
              });
            }

            // Mark as read if viewing (but don't refetch messages)
            if (
              newMessage.author_id !== currentUserRef.current?.id &&
              newMessage.conversation_id
            ) {
              markAsRead(newMessage.conversation_id).catch(console.error);
            }
          }

          // Update conversation list's last message
          setConversations((prev) => {
            const updated = prev.map((conv) =>
              conv.id === newMessage.conversation_id
                ? {
                    ...conv,
                    lastMessage: newMessage.parent_message_id
                      ? conv.lastMessage
                      : {
                          id: newMessage.id,
                          conversationId: newMessage.conversation_id,
                          authorId: newMessage.author_id,
                          authorEmail: senderEmail,
                          authorFullname: senderFullname,
                          content: newMessage.content,
                          createdAt: new Date(newMessage.created_at),
                          readBy: [],
                        },
                    updatedAt: new Date(newMessage.created_at),
                    unreadCount:
                      newMessage.conversation_id ===
                      activeConversationIdRef.current
                        ? 0 // Active conversation, no unread
                        : (conv.unreadCount || 0) +
                          (newMessage.parent_message_id ? 0 : 1), // Increment unread for other conversations (only top-level)
                  }
                : conv
            );

            // Update conversations cache
            conversationsCacheRef.current = updated;

            return updated;
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_reads",
        },
        (payload) => {
          console.log("[MESSAGING] Read receipt received:", payload);

          const readReceipt = payload.new as {
            message_id: string;
            user_id: string;
          };

          // Update read receipts in active conversation without refetching
          if (readReceipt.message_id && activeConversationIdRef.current) {
            setMessages((prev) => {
              const updated = prev.map((msg) =>
                msg.id === readReceipt.message_id
                  ? {
                      ...msg,
                      readBy: msg.readBy.includes(readReceipt.user_id)
                        ? msg.readBy
                        : [...msg.readBy, readReceipt.user_id],
                    }
                  : msg
              );

              // Update cache
              if (activeConversationIdRef.current) {
                const cacheEntry = messagesCacheRef.current.get(
                  activeConversationIdRef.current
                );
                if (cacheEntry) {
                  messagesCacheRef.current.set(
                    activeConversationIdRef.current,
                    {
                      messages: updated,
                    }
                  );
                }
              }

              return updated;
            });

            // Also update thread messages if thread is open
            if (threadParentIdRef.current) {
              setThreadMessages((prev) => {
                const updated = prev.map((msg) =>
                  msg.id === readReceipt.message_id
                    ? {
                        ...msg,
                        readBy: msg.readBy.includes(readReceipt.user_id)
                          ? msg.readBy
                          : [...msg.readBy, readReceipt.user_id],
                      }
                    : msg
                );
                return updated;
              });
            }
          }
        }
      )
      .subscribe((status) => {
        console.log("[MESSAGING] Realtime subscription status:", status);
      });

    return () => {
      console.log("[MESSAGING] Cleaning up realtime subscriptions");
      supabase.removeChannel(messagesChannel);
    };
  }, [currentUser?.id]);

  // Handle sending message
  const handleSendMessage = async (
    content: string,
    parentMessageId?: string
  ) => {
    if (!activeConversationId || !content.trim() || !currentUser) return;

    const messageContent = content.trim();

    // Optimistically add message to UI immediately
    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      conversationId: activeConversationId,
      authorId: currentUser.id,
      authorEmail: currentUser.email || "",
      authorFullname: currentUser.fullname || null,
      content: messageContent,
      createdAt: new Date(),
      parentMessageId: parentMessageId || null,
      threadReplyCount: 0,
      readBy: [],
    };

    if (parentMessageId) {
      // Thread reply
      setThreadMessages((prev) => [...prev, optimisticMessage]);
    } else {
      // Top-level message
      setMessages((prev) => [...prev, optimisticMessage]);
    }

    try {
      setIsSendingMessage(true);
      const sentMessage = await sendMessage(
        activeConversationId,
        messageContent,
        parentMessageId
      );

      if (sentMessage) {
        // Replace optimistic message with real one
        if (parentMessageId) {
          setThreadMessages((prev) =>
            prev.map((msg) =>
              msg.id === optimisticMessage.id ? sentMessage : msg
            )
          );
        } else {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === optimisticMessage.id ? sentMessage : msg
            )
          );
        }

        // Update cache
        const cacheEntry = messagesCacheRef.current.get(activeConversationId);
        if (cacheEntry) {
          if (parentMessageId) {
            // Update thread reply count in parent message
            const updatedMessages = cacheEntry.messages.map((msg) =>
              msg.id === parentMessageId
                ? { ...msg, threadReplyCount: (msg.threadReplyCount || 0) + 1 }
                : msg
            );
            messagesCacheRef.current.set(activeConversationId, {
              messages: updatedMessages,
            });
          } else {
            // Replace optimistic message in cache
            const updatedMessages = cacheEntry.messages.map((msg) =>
              msg.id === optimisticMessage.id ? sentMessage : msg
            );
            messagesCacheRef.current.set(activeConversationId, {
              messages: updatedMessages,
            });
          }
        }

        // Update conversation list's last message
        setConversations((prev) => {
          const updated = prev.map((conv) =>
            conv.id === activeConversationId
              ? {
                  ...conv,
                  lastMessage: parentMessageId
                    ? conv.lastMessage
                    : {
                        id: sentMessage.id,
                        conversationId: sentMessage.conversationId,
                        authorId: sentMessage.authorId,
                        authorEmail: sentMessage.authorEmail,
                        authorFullname: sentMessage.authorFullname,
                        content: sentMessage.content,
                        createdAt: sentMessage.createdAt,
                        readBy: [],
                      },
                  updatedAt: sentMessage.createdAt,
                }
              : conv
          );

          // Update conversations cache
          conversationsCacheRef.current = updated;

          return updated;
        });
      } else {
        // If send failed, remove optimistic message
        if (parentMessageId) {
          setThreadMessages((prev) =>
            prev.filter((msg) => msg.id !== optimisticMessage.id)
          );
        } else {
          setMessages((prev) =>
            prev.filter((msg) => msg.id !== optimisticMessage.id)
          );
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // Remove optimistic message on error
      if (parentMessageId) {
        setThreadMessages((prev) =>
          prev.filter((msg) => msg.id !== optimisticMessage.id)
        );
      } else {
        setMessages((prev) =>
          prev.filter((msg) => msg.id !== optimisticMessage.id)
        );
      }
      toast.error("Failed to send message");
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Handle creating new channel
  const handleCreateChannel = async (
    name: string,
    description: string | null,
    isPrivate: boolean,
    participantIds: string[]
  ) => {
    if (!currentUser) return;

    try {
      const conversation = await createChannel(
        name,
        description,
        isPrivate,
        participantIds
      );

      if (conversation) {
        setConversations((prev) => {
          const updated = [conversation, ...prev];
          conversationsCacheRef.current = updated;
          return updated;
        });
        setActiveConversationId(conversation.id);
        setShowCreateChannel(false);
        toast.success("Channel created");
      }
    } catch (error) {
      console.error("Error creating channel:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create channel"
      );
    }
  };

  // Handle creating new DM
  const handleCreateDM = async (userId: string) => {
    if (!currentUser) return;

    try {
      // Check if DM already exists
      const existingDM = conversations.find(
        (conv) =>
          conv.type === "dm" &&
          conv.participants.some((p) => p.userId === userId) &&
          conv.participants.length === 2
      );

      if (existingDM) {
        // Open existing DM
        setActiveConversationId(existingDM.id);
        setShowCreateChannel(false);
        return;
      }

      // Create new DM
      const conversation = await createDM(userId);

      if (conversation) {
        setConversations((prev) => {
          const updated = [conversation, ...prev];
          conversationsCacheRef.current = updated;
          return updated;
        });
        setActiveConversationId(conversation.id);
        setShowCreateChannel(false);
        toast.success("Conversation started");
      }
    } catch (error) {
      console.error("Error creating DM:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to start conversation"
      );
    }
  };

  // Get active conversation
  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  );

  // Debug logging for conversation data
  useEffect(() => {
    if (activeConversation) {
      console.log("[MESSAGING] Active conversation:", {
        id: activeConversation.id,
        name: activeConversation.name,
        type: activeConversation.type,
        participants: activeConversation.participants,
      });
    }
  }, [activeConversation]);

  // Helper to get the other participant in a DM
  const getOtherParticipant = (conversation: Conversation) => {
    return conversation.participants.find((p) => p.userId !== currentUser?.id);
  };

  // Helper to get display name for conversation
  const getConversationDisplayName = (conversation: Conversation) => {
    if (conversation.name) {
      return conversation.name;
    }
    if (conversation.type === "dm") {
      const other = getOtherParticipant(conversation);
      return other?.fullname || other?.email || "Unknown User";
    }
    return "Unnamed Channel";
  };

  // Helper to get initials for avatar
  const getConversationInitials = (conversation: Conversation) => {
    if (conversation.type === "dm") {
      const other = getOtherParticipant(conversation);
      const name = other?.fullname || other?.email || "?";
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return conversation.name
      ? conversation.name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)
      : "#";
  };

  return (
    <div className="h-full w-full flex bg-black">
      {/* Sidebar */}
      <div className="relative z-0 w-80 border-r border-gray-800 flex flex-col bg-gray-900/50">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <MessageSquare size={24} />
            Messages
          </h2>
          <button
            onClick={() => setShowCreateChannel(true)}
            className="p-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition flex items-center justify-center"
            title="New conversation"
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Conversation List */}
        {isLoadingConversations ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          </div>
        ) : (
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={setActiveConversationId}
          />
        )}
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {activeConversation ? (
          <>
            {/* Chat Header */}
            <div className="flex-shrink-0 p-4 border-b border-gray-800 bg-gray-900 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Avatar for DM or Icon for Channel */}
                {activeConversation.type === "channel" ? (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center">
                    <Hash size={20} className="text-white" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center text-white text-sm font-medium">
                    {getConversationInitials(activeConversation)}
                  </div>
                )}
                <div>
                  <h3 className="text-white font-semibold text-lg">
                    {getConversationDisplayName(activeConversation)}
                  </h3>
                  {activeConversation.type === "dm" ? (
                    <p className="text-xs text-gray-400">
                      {getOtherParticipant(activeConversation)?.email || ""}
                    </p>
                  ) : (
                    activeConversation.description && (
                      <p className="text-xs text-gray-400">
                        {activeConversation.description}
                      </p>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {isLoadingMessages ? (
                <div className="h-full flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                </div>
              ) : (
                <MessageList
                  messages={messages}
                  participants={activeConversation.participants}
                  currentUserId={currentUser?.id || ""}
                  onMessageClick={(messageId) => setThreadParentId(messageId)}
                />
              )}
            </div>

            {/* Message Input */}
            <div className="flex-shrink-0">
              <MessageInput
                onSend={(content) => handleSendMessage(content)}
                isLoading={isSendingMessage}
                participants={activeConversation.participants}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageSquare size={64} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg mb-2">Select a conversation</p>
              <p className="text-sm">or start a new one</p>
            </div>
          </div>
        )}

        {/* Thread Panel Overlay */}
        {threadParentId && activeConversation && (
          <ThreadPanel
            parentMessage={messages.find((m) => m.id === threadParentId)}
            threadMessages={threadMessages}
            participants={activeConversation.participants}
            currentUserId={currentUser?.id || ""}
            onClose={() => {
              setThreadParentId(null);
              setThreadMessages([]);
            }}
            onSendReply={(content) =>
              handleSendMessage(content, threadParentId)
            }
            isLoading={isSendingMessage}
          />
        )}
      </div>

      {/* Create Channel Modal */}
      {showCreateChannel && (
        <CreateChannelModal
          onClose={() => setShowCreateChannel(false)}
          onCreate={handleCreateChannel}
          onCreateDM={handleCreateDM}
        />
      )}
    </div>
  );
}
