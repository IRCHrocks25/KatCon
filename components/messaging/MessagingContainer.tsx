"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, MessageSquare, Hash, FolderOpen, ListTodo } from "lucide-react";
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
  joinChannel,
  markAsRead,
  type Conversation,
  type Message,
  type FileAttachment,
} from "@/lib/supabase/messaging";
import { uploadFile } from "@/lib/supabase/file-upload";
import { ConversationList } from "./ConversationList";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ThreadPanel } from "./ThreadPanel";
import { CreateChannelModal } from "./CreateChannelModal";
import { ChannelSettingsDialog } from "./ChannelSettingsDialog";
import { FilesModal } from "./FilesModal";
import { RemindersModal } from "@/components/reminders/RemindersModal";
import type { Reminder } from "@/lib/supabase/reminders";

// Session cache for messages (persists until logout)
// Module-level cache that survives component unmount/remount (e.g., tab switches)
interface MessageCacheEntry {
  messages: Message[];
}

const messagesCacheMap = new Map<string, MessageCacheEntry>();
let conversationsCache: Conversation[] | null = null;

interface MessagingContainerProps {
  reminders: Reminder[];
  setReminders: React.Dispatch<React.SetStateAction<Reminder[]>>;
}

export function MessagingContainer({
  reminders,
  setReminders,
}: MessagingContainerProps) {
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
  const [showChannelSettingsForId, setShowChannelSettingsForId] = useState<
    string | null
  >(null);
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [showRemindersModal, setShowRemindersModal] = useState(false);

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
      messagesCacheMap.clear();
      conversationsCache = null;
      setConversations([]);
      setMessages([]);
      setThreadMessages([]);
      setActiveConversationId(null);
      setThreadParentId(null);
    }
  }, [currentUser]);

  // Fetch conversations with caching (only fetch if cache is empty)
  const fetchConversations = useCallback(async (forceRefresh = false) => {
    // Check module-level cache first - use it if exists and not forcing refresh
    if (!forceRefresh && conversationsCache && conversationsCache.length > 0) {
      console.log("[MESSAGING] Using cached conversations");
      setConversations(conversationsCache);
      setIsLoadingConversations(false);
      return;
    }

    try {
      setIsLoadingConversations(true);
      const fetchedConversations = await getConversations();
      setConversations(fetchedConversations);

      // Update module-level cache (persists across tab switches)
      conversationsCache = fetchedConversations;
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
      const cacheEntry = messagesCacheMap.get(conversationId);

      // Check module-level cache first - use it if exists and not forcing refresh
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

        // Update module-level cache (persists across tab switches)
        messagesCacheMap.set(conversationId, {
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

  // Helper to refresh conversations (and cache) after structural changes
  const refreshConversations = useCallback(async () => {
    await fetchConversations(true);
  }, [fetchConversations]);

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

  const handleSelectConversation = async (conversationId: string) => {
    const conversation = conversations.find((c) => c.id === conversationId);
    if (!conversation) {
      setActiveConversationId(conversationId);
      return;
    }

    // For public channels where the user is not joined yet, join first
    if (
      conversation.type === "channel" &&
      !conversation.isPrivate &&
      conversation.isJoined === false
    ) {
      try {
        toast.info("Joining channel...");
        await joinChannel(conversation.id);
        await refreshConversations();
      } catch (error) {
        console.error("Error joining channel:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to join channel"
        );
        return;
      }
    }

    setActiveConversationId(conversationId);
  };

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
            file_url?: string | null;
            file_name?: string | null;
            file_type?: string | null;
            file_size?: number | null;
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
            fileUrl: newMessage.file_url || null,
            fileName: newMessage.file_name || null,
            fileType: newMessage.file_type || null,
            fileSize: newMessage.file_size || null,
          };

          // Skip cache updates for our own messages - they're handled via optimistic updates
          const isOwnMessage =
            newMessage.author_id === currentUserRef.current?.id;

          // Always update the cache for this conversation (even if not active)
          const cacheEntry = messagesCacheMap.get(newMessage.conversation_id);
          if (cacheEntry) {
            // Check if message already exists in cache
            const messageExists = cacheEntry.messages.some(
              (msg) => msg.id === newMessage.id
            );
            if (!messageExists && !isOwnMessage) {
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
                messagesCacheMap.set(newMessage.conversation_id, {
                  messages: updatedMessages,
                });
              } else {
                // Top-level message
                messagesCacheMap.set(newMessage.conversation_id, {
                  messages: [...cacheEntry.messages, newMsg],
                });
              }
            } else if (newMessage.parent_message_id && !messageExists) {
              // Still update thread reply count even for own messages
              const updatedMessages = cacheEntry.messages.map((msg) =>
                msg.id === newMessage.parent_message_id
                  ? {
                      ...msg,
                      threadReplyCount: (msg.threadReplyCount || 0) + 1,
                    }
                  : msg
              );
              messagesCacheMap.set(newMessage.conversation_id, {
                messages: updatedMessages,
              });
            }
          } else if (!isOwnMessage) {
            // No cache exists yet, create it with this message (only for other users)
            messagesCacheMap.set(newMessage.conversation_id, {
              messages: [newMsg],
            });
          }

          // If it's the active conversation, also update the UI state
          if (newMessage.conversation_id === activeConversationIdRef.current) {
            // Skip adding our own messages via realtime - we handle them via optimistic updates
            // Only update thread reply counts for our own messages
            const isOwnMessage =
              newMessage.author_id === currentUserRef.current?.id;

            if (newMessage.parent_message_id) {
              // Thread reply
              if (
                !isOwnMessage &&
                newMessage.parent_message_id === threadParentIdRef.current
              ) {
                // Update thread messages (only for other users' messages)
                setThreadMessages((prev) => {
                  const messageExists = prev.some(
                    (msg) => msg.id === newMessage.id
                  );
                  if (messageExists) return prev;
                  return [...prev, newMsg];
                });
              }
              // Update thread reply count in main messages (for all messages)
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
            } else if (!isOwnMessage) {
              // Top-level message from other users
              setMessages((prev) => {
                const messageExists = prev.some(
                  (msg) => msg.id === newMessage.id
                );
                if (messageExists) return prev;
                return [...prev, newMsg];
              });
            }

            // Mark as read if viewing (but don't refetch messages)
            if (!isOwnMessage && newMessage.conversation_id) {
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
                          fileUrl: newMessage.file_url || null,
                          fileName: newMessage.file_name || null,
                          fileType: newMessage.file_type || null,
                          fileSize: newMessage.file_size || null,
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

            // Update module-level conversations cache
            conversationsCache = updated;

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

              // Update module-level cache
              if (activeConversationIdRef.current) {
                const cacheEntry = messagesCacheMap.get(
                  activeConversationIdRef.current
                );
                if (cacheEntry) {
                  messagesCacheMap.set(activeConversationIdRef.current, {
                    messages: updated,
                  });
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

  // Handle sending a single message (internal)
  const sendSingleMessage = async (
    content: string,
    parentMessageId?: string,
    file?: File
  ): Promise<boolean> => {
    if (!activeConversationId || !currentUser) return false;

    const hasContent = content.trim().length > 0;
    const hasFile = file !== undefined;

    if (!hasContent && !hasFile) return false;

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
      // Add file info optimistically if file is present
      fileUrl: file ? URL.createObjectURL(file) : null,
      fileName: file?.name || null,
      fileType: file?.type || null,
      fileSize: file?.size || null,
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

      // Upload file if present
      let fileAttachment: FileAttachment | undefined;
      if (file) {
        try {
          const uploadResult = await uploadFile(
            file,
            currentUser.id,
            activeConversationId
          );
          fileAttachment = {
            url: uploadResult.url,
            name: uploadResult.fileName,
            type: uploadResult.fileType,
            size: uploadResult.fileSize,
          };
        } catch (uploadError) {
          console.error("File upload failed:", uploadError);
          toast.error("Failed to upload file");
          // Remove optimistic message on upload failure
          if (parentMessageId) {
            setThreadMessages((prev) =>
              prev.filter((msg) => msg.id !== optimisticMessage.id)
            );
          } else {
            setMessages((prev) =>
              prev.filter((msg) => msg.id !== optimisticMessage.id)
            );
          }
          return false;
        }
      }

      const sentMessage = await sendMessage(
        activeConversationId,
        messageContent,
        parentMessageId,
        fileAttachment
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

        // Update module-level cache
        const cacheEntry = messagesCacheMap.get(activeConversationId);
        if (cacheEntry) {
          if (parentMessageId) {
            // Update thread reply count in parent message
            const updatedMessages = cacheEntry.messages.map((msg) =>
              msg.id === parentMessageId
                ? { ...msg, threadReplyCount: (msg.threadReplyCount || 0) + 1 }
                : msg
            );
            messagesCacheMap.set(activeConversationId, {
              messages: updatedMessages,
            });
          } else {
            // Replace optimistic message in cache
            const updatedMessages = cacheEntry.messages.map((msg) =>
              msg.id === optimisticMessage.id ? sentMessage : msg
            );
            messagesCacheMap.set(activeConversationId, {
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
                        fileUrl: sentMessage.fileUrl || null,
                        fileName: sentMessage.fileName || null,
                        fileType: sentMessage.fileType || null,
                        fileSize: sentMessage.fileSize || null,
                      },
                  updatedAt: sentMessage.createdAt,
                }
              : conv
          );

          // Update module-level conversations cache
          conversationsCache = updated;

          return updated;
        });
        return true;
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
        return false;
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
      return false;
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Handle sending message with multiple files (each file as separate message)
  const handleSendMessage = async (
    content: string,
    parentMessageId?: string,
    files?: File[]
  ) => {
    if (!activeConversationId || !currentUser) return;

    const hasContent = content.trim().length > 0;
    const hasFiles = files && files.length > 0;

    if (!hasContent && !hasFiles) return;

    // If no files, just send the text message
    if (!hasFiles) {
      await sendSingleMessage(content, parentMessageId);
      return;
    }

    // If we have files, send each as a separate message
    // First message gets the text content, subsequent messages are file-only
    setIsSendingMessage(true);

    for (let i = 0; i < files.length; i++) {
      const isFirstMessage = i === 0;
      const messageContent = isFirstMessage ? content : "";

      await sendSingleMessage(messageContent, parentMessageId, files[i]);

      // Small delay between messages to ensure order
      if (i < files.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    setIsSendingMessage(false);
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
          conversationsCache = updated;
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
          conversationsCache = updated;
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
            onSelectConversation={handleSelectConversation}
            onOpenChannelSettings={(conversationId) =>
              setShowChannelSettingsForId(conversationId)
            }
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
              {/* Header Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFilesModal(true)}
                  className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition flex items-center gap-2"
                  title="View shared files"
                >
                  <FolderOpen size={20} />
                  <span className="text-sm hidden sm:inline">Files</span>
                </button>
                <button
                  onClick={() => setShowRemindersModal(true)}
                  className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition flex items-center gap-2 relative"
                  title="View tasks"
                >
                  <ListTodo size={20} />
                  <span className="text-sm hidden sm:inline">Tasks</span>
                  {reminders.filter((r) => r.status === "pending").length >
                    0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-purple-600 rounded-full text-white text-xs flex items-center justify-center font-semibold">
                      {reminders.filter((r) => r.status === "pending").length >
                      9
                        ? "9+"
                        : reminders.filter((r) => r.status === "pending")
                            .length}
                    </span>
                  )}
                </button>
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
                onSend={(content, files) =>
                  handleSendMessage(content, undefined, files)
                }
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
            onSendReply={(content, files) =>
              handleSendMessage(content, threadParentId, files)
            }
            isLoading={isSendingMessage}
          />
        )}
      </div>

      {/* Channel Settings Dialog */}
      <ChannelSettingsDialog
        open={Boolean(showChannelSettingsForId)}
        conversation={
          conversations.find((c) => c.id === showChannelSettingsForId) || null
        }
        onClose={() => setShowChannelSettingsForId(null)}
        onParticipantsChanged={async () => {
          await refreshConversations();
        }}
      />

      {/* Create Channel Modal */}
      {showCreateChannel && (
        <CreateChannelModal
          onClose={() => setShowCreateChannel(false)}
          onCreate={handleCreateChannel}
          onCreateDM={handleCreateDM}
        />
      )}

      {/* Files Modal */}
      {activeConversation && (
        <FilesModal
          isOpen={showFilesModal}
          onClose={() => setShowFilesModal(false)}
          conversationId={activeConversation.id}
          conversationName={getConversationDisplayName(activeConversation)}
        />
      )}

      {/* Reminders Modal */}
      <RemindersModal
        isOpen={showRemindersModal}
        onClose={() => setShowRemindersModal(false)}
        reminders={reminders}
        setReminders={setReminders}
      />
    </div>
  );
}
