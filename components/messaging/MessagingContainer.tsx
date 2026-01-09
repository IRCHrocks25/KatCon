"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus,
  MessageSquare,
  Hash,
  FolderOpen,
  RefreshCw,
  Search,
  Pin,
  KanbanSquare,
  X,
  MoreVertical,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase/client";
import {
  getConversations,
  getMessages,
  getThreadMessages,
  getMessagesAround,
  sendMessage,
  createChannel,
  createDM,
  joinChannel,
  markAsRead,
  getPinnedMessages,
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
import { FilesModal, invalidateFilesCache } from "./FilesModal";
import { JoinChannelModal } from "./JoinChannelModal";
import { RemindersModal } from "@/components/reminders/RemindersModal";
import { KanbanView } from "@/components/kanban/KanbanView";
import { MessageSearch } from "./MessageSearch";
import { PinnedMessagesPanel } from "./PinnedMessagesPanel";
import type { Reminder } from "@/lib/supabase/reminders";
import { updateUnreadMessagesNotification } from "@/lib/supabase/notifications";
import { Avatar } from "@/components/ui/avatar";

// Session cache for messages (persists until logout)
// Module-level cache that survives component unmount/remount (e.g., tab switches)
interface MessageCacheEntry {
  messages: Message[];
}

const messagesCacheMap = new Map<string, MessageCacheEntry>();
let conversationsCache: Conversation[] | null = null;
// Track which user the cache belongs to
let cachedUserId: string | null = null;

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
  const [showJoinChannelModal, setShowJoinChannelModal] = useState(false);
  const [channelToJoin, setChannelToJoin] = useState<Conversation | null>(null);
  const [isJoiningChannel, setIsJoiningChannel] = useState(false);
  const [showRemindersModal, setShowRemindersModal] = useState(false);
  const [initialEditingReminder, setInitialEditingReminder] = useState<Reminder | null>(null);

  // Callback for opening task modal from Kanban
  const handleOpenTaskModal = useCallback((editingReminder?: Reminder) => {
    setInitialEditingReminder(editingReminder || null);
    setForceShowCreateForm(!editingReminder); // Force show create form if no editing reminder
    setShowRemindersModal(true);
  }, []);

  // Force show create form when opening from kanban board
  const [forceShowCreateForm, setForceShowCreateForm] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeSearchResultId, setActiveSearchResultId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoadingSearchMessage, setIsLoadingSearchMessage] = useState(false);
  const [searchResultIds, setSearchResultIds] = useState<string[]>([]);
  const [isPinnedMessagesOpen, setIsPinnedMessagesOpen] = useState(false);
  const [pinnedMessageIds, setPinnedMessageIds] = useState<string[]>([]);
  const [isKanbanModalOpen, setIsKanbanModalOpen] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [conversationSearchQuery, setConversationSearchQuery] = useState("");

  // Refresh pinned message IDs
  const refreshPinnedMessageIds = useCallback(async (conversationId: string) => {
    try {
      const pinnedMessages = await getPinnedMessages(conversationId);
      setPinnedMessageIds(pinnedMessages.map((pm) => pm.messageId));
    } catch (error) {
      console.error("Error refreshing pinned messages:", error);
    }
  }, []);

  // Listen for pinned message refresh events
  useEffect(() => {
    const handleRefresh = (event: CustomEvent) => {
      const { conversationId } = event.detail || {};
      if (conversationId && conversationId === activeConversationId) {
        refreshPinnedMessageIds(conversationId);
      }
    };

    window.addEventListener("refreshPinnedMessageIds", handleRefresh as EventListener);
    return () => {
      window.removeEventListener("refreshPinnedMessageIds", handleRefresh as EventListener);
    };
  }, [activeConversationId, refreshPinnedMessageIds]);
  const [hasMoreMessages, setHasMoreMessages] = useState<{
    [conversationId: string]: boolean;
  }>({});
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);

  // Use refs to avoid dependency issues in realtime subscription
  const conversationsRef = useRef<Conversation[]>([]);
  const activeConversationIdRef = useRef<string | null>(null);
  const threadParentIdRef = useRef<string | null>(null);
  const currentUserRef = useRef(currentUser);

  // Track markAsRead calls to prevent duplicates
  const lastMarkedAsReadRef = useRef<{
    conversationId: string;
    timestamp: number;
  } | null>(null);
  const markAsReadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track notification updates to prevent duplicates
  const notificationUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastNotificationCountRef = useRef<number>(-1);

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

  // Clear cache on logout OR when user changes
  useEffect(() => {
    if (!currentUser) {
      console.log("[MESSAGING] Clearing cache on logout");
      messagesCacheMap.clear();
      conversationsCache = null;
      cachedUserId = null;
      setConversations([]);
      setMessages([]);
      setThreadMessages([]);
      setActiveConversationId(null);
      setThreadParentId(null);
    } else if (cachedUserId && cachedUserId !== currentUser.id) {
      // User changed (different user logged in) - clear cache
      console.log("[MESSAGING] Clearing cache - user changed");
      messagesCacheMap.clear();
      conversationsCache = null;
      cachedUserId = currentUser.id;
      setConversations([]);
      setMessages([]);
      setThreadMessages([]);
      setActiveConversationId(null);
      setThreadParentId(null);
    } else if (!cachedUserId && currentUser) {
      // First time setting user
      cachedUserId = currentUser.id;
    }
  }, [currentUser]);

  // Calculate total unread messages across all conversations
  const calculateTotalUnread = useCallback((convs: Conversation[]): number => {
    return convs.reduce((total, conv) => total + (conv.unreadCount || 0), 0);
  }, []);

  // Update unread messages notification
  const updateUnreadNotification = useCallback(
    async (convs: Conversation[]) => {
      if (!currentUser?.email) return;

      const totalUnread = calculateTotalUnread(convs);
      
      // Skip if count hasn't changed
      if (totalUnread === lastNotificationCountRef.current) {
        return;
      }

      // Clear any pending update
      if (notificationUpdateTimeoutRef.current) {
        clearTimeout(notificationUpdateTimeoutRef.current);
        notificationUpdateTimeoutRef.current = null;
      }

      // Debounce the notification update
      notificationUpdateTimeoutRef.current = setTimeout(async () => {
        lastNotificationCountRef.current = totalUnread;
        await updateUnreadMessagesNotification(currentUser.email, totalUnread);
        notificationUpdateTimeoutRef.current = null;
      }, 500); // 500ms debounce
    },
    [currentUser?.email, calculateTotalUnread]
  );

  // Fetch conversations with caching (only fetch if cache is empty)
  const fetchConversations = useCallback(
    async (forceRefresh = false) => {
      // Check if cache belongs to current user
      if (cachedUserId !== currentUser?.id) {
        console.log("[MESSAGING] Cache user mismatch, forcing refresh");
        forceRefresh = true;
        messagesCacheMap.clear();
        conversationsCache = null;
      }

      // Check module-level cache first - use it if exists and not forcing refresh
      // Accept empty arrays too (user might have no conversations)
      if (!forceRefresh && conversationsCache !== null) {
        console.log("[MESSAGING] Using cached conversations");
        setConversations(conversationsCache);
        setIsLoadingConversations(false);
        // Update unread messages notification with cached data
        if (currentUser?.email) {
          updateUnreadNotification(conversationsCache).catch((error) => {
            console.error(
              "[MESSAGING] Error updating unread messages notification:",
              error
            );
          });
        }
        return;
      }

      try {
        setIsLoadingConversations(true);
        const fetchedConversations = await getConversations();
        setConversations(fetchedConversations);

        // Update module-level cache (persists across tab switches)
        conversationsCache = fetchedConversations;
        cachedUserId = currentUser?.id || null;

        // Update unread messages notification
        if (currentUser?.email) {
          updateUnreadNotification(fetchedConversations).catch((error) => {
            console.error(
              "[MESSAGING] Error updating unread messages notification:",
              error
            );
          });
        }
      } catch (error) {
        console.error("Error fetching conversations:", error);
        toast.error("Failed to load conversations");
      } finally {
        setIsLoadingConversations(false);
      }
    },
    [currentUser, updateUnreadNotification]
  );

  // Optimized markAsRead with debouncing and deduplication
  const debouncedMarkAsRead = useCallback(
    (conversationId: string) => {
      const lastMarked = lastMarkedAsReadRef.current;
      const now = Date.now();

      // Skip if we marked this conversation within the last 2 seconds
      if (
        lastMarked &&
        lastMarked.conversationId === conversationId &&
        now - lastMarked.timestamp < 2000
      ) {
        return;
      }

      // Clear any pending timeout for this conversation
      if (markAsReadTimeoutRef.current) {
        clearTimeout(markAsReadTimeoutRef.current);
        markAsReadTimeoutRef.current = null;
      }

      // Debounce by 300ms to batch rapid calls
      markAsReadTimeoutRef.current = setTimeout(() => {
        markAsRead(conversationId)
          .then(() => {
            lastMarkedAsReadRef.current = {
              conversationId,
              timestamp: Date.now(),
            };
            // Update notification after marking as read
            updateUnreadNotification(conversationsRef.current);
          })
          .catch((error) => {
            console.error("[MESSAGING] Error marking as read:", error);
          })
          .finally(() => {
            markAsReadTimeoutRef.current = null;
          });
      }, 300);
    },
    [updateUnreadNotification]
  );

  // Fetch messages for active conversation with caching (only fetch if cache is empty)
  const fetchMessages = useCallback(
    async (conversationId: string, forceRefresh = false) => {
      // Check if cache belongs to current user
      if (cachedUserId !== currentUser?.id) {
        console.log("[MESSAGING] Cache user mismatch, forcing refresh");
        forceRefresh = true;
        messagesCacheMap.clear();
      }

      const cacheEntry = messagesCacheMap.get(conversationId);

      // Check module-level cache first - use it if exists and not forcing refresh
      if (!forceRefresh && cacheEntry && cacheEntry.messages.length > 0) {
        console.log(
          "[MESSAGING] Using cached messages for conversation:",
          conversationId
        );
        setMessages(cacheEntry.messages);
        setIsLoadingMessages(false);

        // Mark as read with debouncing
        debouncedMarkAsRead(conversationId);
        return;
      }

      try {
        setIsLoadingMessages(true);
        const { messages: fetchedMessages, hasMore } = await getMessages(
          conversationId
        );
        setMessages(fetchedMessages);
        setHasMoreMessages((prev) => ({ ...prev, [conversationId]: hasMore }));

        // Update module-level cache (persists across tab switches)
        messagesCacheMap.set(conversationId, {
          messages: fetchedMessages,
        });
        cachedUserId = currentUser?.id || null;

        // Fetch pinned message IDs for this conversation
        try {
          const pinnedMessages = await getPinnedMessages(conversationId);
          setPinnedMessageIds(pinnedMessages.map((pm) => pm.messageId));
        } catch (error) {
          console.error("Error fetching pinned messages:", error);
          setPinnedMessageIds([]);
        }

        // Mark conversation as read when viewing (with debouncing)
        debouncedMarkAsRead(conversationId);
      } catch (error) {
        console.error("Error fetching messages:", error);
        toast.error("Failed to load messages");
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [currentUser, debouncedMarkAsRead, updateUnreadNotification]
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

  // Initial load - only fetch once per user, use ref to prevent duplicate calls
  const hasFetchedRef = useRef<{ userId: string | null; fetched: boolean }>({
    userId: null,
    fetched: false,
  });

  useEffect(() => {
    if (!currentUser) {
      hasFetchedRef.current = { userId: null, fetched: false };
      return;
    }

    // Only fetch if we haven't fetched for this user yet, or if cache is invalid
    const shouldFetch =
      !hasFetchedRef.current.fetched ||
      hasFetchedRef.current.userId !== currentUser.id ||
      conversationsCache === null;

    if (shouldFetch) {
      hasFetchedRef.current = { userId: currentUser.id, fetched: true };
      fetchConversations();
    }
  }, [currentUser?.id, fetchConversations]);

  // Cleanup markAsRead timeout on unmount or user change
  useEffect(() => {
    return () => {
      if (markAsReadTimeoutRef.current) {
        clearTimeout(markAsReadTimeoutRef.current);
        markAsReadTimeoutRef.current = null;
      }
      if (notificationUpdateTimeoutRef.current) {
        clearTimeout(notificationUpdateTimeoutRef.current);
        notificationUpdateTimeoutRef.current = null;
      }
      // Reset last marked when user changes
      lastMarkedAsReadRef.current = null;
      lastNotificationCountRef.current = -1;
    };
  }, [currentUser?.id]);

  // Helper to refresh conversations (and cache) after structural changes
  const refreshConversations = useCallback(async () => {
    await fetchConversations(true);
  }, [fetchConversations]);

  // Update notification when conversations change
  useEffect(() => {
    if (currentUser?.email && conversations.length > 0) {
      updateUnreadNotification(conversations).catch((error) => {
        console.error(
          "[MESSAGING] Error updating unread messages notification:",
          error
        );
      });
    }
  }, [conversations, currentUser?.email, updateUnreadNotification]);

  // Handle manual refresh of messages and conversations
  const handleManualRefresh = useCallback(async () => {
    if (isRefreshing) return;

    try {
      setIsRefreshing(true);
      console.log("[MESSAGING] Manual refresh triggered");

      // Refresh conversations
      await fetchConversations(true);

      // If there's an active conversation, also refresh its messages
      if (activeConversationId) {
        // Reset pagination state for this conversation
        setHasMoreMessages((prev) => ({
          ...prev,
          [activeConversationId]: false,
        }));

        await fetchMessages(activeConversationId, true);
      }

      toast.success("Messages refreshed");
    } catch (error) {
      console.error("[MESSAGING] Error during manual refresh:", error);
      toast.error("Failed to refresh messages");
    } finally {
      setIsRefreshing(false);
    }
  }, [activeConversationId, isRefreshing, fetchConversations, fetchMessages]);

  // Load older messages (pagination)
  const loadOlderMessages = useCallback(async () => {
    if (!activeConversationId || isLoadingOlderMessages) return;

    const oldestMessage = messages[0];
    if (!oldestMessage) return;

    try {
      setIsLoadingOlderMessages(true);
      console.log(
        "[MESSAGING] Loading older messages before:",
        oldestMessage.id
      );

      const { messages: olderMessages, hasMore } = await getMessages(
        activeConversationId,
        oldestMessage.id,
        30
      );

      if (olderMessages.length > 0) {
        // Prepend older messages to existing ones
        setMessages((prev) => [...olderMessages, ...prev]);
        setHasMoreMessages((prev) => ({
          ...prev,
          [activeConversationId]: hasMore,
        }));

        // Update cache with new merged messages
        const updatedMessages = [...olderMessages, ...messages];
        messagesCacheMap.set(activeConversationId, {
          messages: updatedMessages,
        });

        toast.success(`Loaded ${olderMessages.length} older messages`);
      } else {
        setHasMoreMessages((prev) => ({
          ...prev,
          [activeConversationId]: false,
        }));
        toast.info("No more messages to load");
      }
    } catch (error) {
      console.error("[MESSAGING] Error loading older messages:", error);
      toast.error("Failed to load older messages");
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [activeConversationId, messages, isLoadingOlderMessages]);

  // Load messages when conversation is selected
  useEffect(() => {
    if (activeConversationId) {
      fetchMessages(activeConversationId);
      setThreadParentId(null);
      setThreadMessages([]);
      // Close search when switching conversations
      setIsSearchOpen(false);
      setActiveSearchResultId("");
      setSearchQuery("");
      setSearchResultIds([]);
    } else {
      setMessages([]);
      setIsSearchOpen(false);
      setActiveSearchResultId("");
      setSearchQuery("");
      setSearchResultIds([]);
    }
  }, [activeConversationId, fetchMessages]);

  // Handle global keyboard shortcut for search (Cmd/Ctrl+F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        if (activeConversationId) {
          setIsSearchOpen(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeConversationId]);

  const handleSelectConversation = async (conversationId: string) => {
    const conversation = conversations.find((c) => c.id === conversationId);
    if (!conversation) {
      setActiveConversationId(conversationId);
      return;
    }

    // For public channels where the user is not joined yet, show join modal
    if (
      conversation.type === "channel" &&
      !conversation.isPrivate &&
      conversation.isJoined === false
    ) {
      setChannelToJoin(conversation);
      setShowJoinChannelModal(true);
      return;
    }

    setActiveConversationId(conversationId);
  };

  // Handle joining a channel from the modal
  const handleJoinChannel = async (channelId: string) => {
    if (!channelToJoin) return;

    try {
      setIsJoiningChannel(true);
      await joinChannel(channelId);
      await refreshConversations();
      setActiveConversationId(channelId);
    } catch (error) {
      console.error("Error joining channel:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to join channel"
      );
    } finally {
      setIsJoiningChannel(false);
    }
  };

  // Load thread messages when thread is opened
  useEffect(() => {
    if (threadParentId) {
      fetchThreadMessages(threadParentId);
    } else {
      setThreadMessages([]);
    }
  }, [threadParentId, fetchThreadMessages]);

  // Realtime subscription for new messages and conversations
  useEffect(() => {
    if (!currentUser?.id) return;

    console.log("[MESSAGING] Setting up realtime subscriptions");

    // Subscribe to new conversations
    const conversationsChannel = supabase
      .channel("conversations-updates")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversations",
        },
        async (payload) => {
          console.log("[MESSAGING] New conversation received:", payload);

          const newConversation = payload.new as {
            id: string;
            name: string | null;
            description: string | null;
            type: "channel" | "dm";
            is_private: boolean;
            created_by: string;
            created_at: string;
            updated_at: string;
          };

          // Check if this conversation was created by the current user
          const isCreatedByCurrentUser = newConversation.created_by === currentUser.id;

          if (isCreatedByCurrentUser) {
            console.log("[MESSAGING] Conversation created by current user, already handled locally");
            return;
          }

          // For conversations created by others, we need to check if current user should see it
          // Since there might be timing issues with participants table, let's refetch all conversations
          // This ensures we have the most up-to-date conversation list
          console.log("[MESSAGING] Refetching conversations due to new conversation:", newConversation.id);

          try {
            const allConversations = await getConversations();
            setConversations(allConversations);
            conversationsCache = allConversations;
            cachedUserId = currentUser?.id || null;
            console.log("[MESSAGING] Refreshed conversations list with", allConversations.length, "conversations");
          } catch (error) {
            console.error("[MESSAGING] Error refetching conversations:", error);
          }
        }
      )
      .subscribe((status) => {
        console.log("[MESSAGING] Conversations subscription status:", status);
      });

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

          // Safety check: ensure we're still the same user
          if (currentUserRef.current?.id !== cachedUserId) {
            console.log("[MESSAGING] User changed, ignoring realtime message");
            return;
          }

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

          // Check if we have this conversation in our local list
          const hasConversation = conversationsRef.current?.some(
            (conv) => conv.id === newMessage.conversation_id
          );

          console.log("[MESSAGING] Message received for conversation:", newMessage.conversation_id, "Has conversation locally:", hasConversation);

          if (!hasConversation) {
            console.log("[MESSAGING] Received message for unknown conversation, refreshing conversations:", newMessage.conversation_id);

            // Try multiple times with delay to handle potential race conditions
            let attempts = 0;
            const maxAttempts = 3;

            while (attempts < maxAttempts) {
              try {
                console.log(`[MESSAGING] Attempt ${attempts + 1}/${maxAttempts} to fetch conversations`);

                const allConversations = await getConversations();
                console.log("[MESSAGING] Fetched conversations result:", allConversations.length, "conversations");

                // Check if the target conversation is now in the fetched list
                const targetConversation = allConversations.find(c => c.id === newMessage.conversation_id);
                console.log("[MESSAGING] Target conversation found in fetch:", !!targetConversation, targetConversation?.id);

                if (targetConversation) {
                  setConversations(allConversations);
                  conversationsCache = allConversations;
                  cachedUserId = currentUser?.id || null;
                  console.log("[MESSAGING] Successfully refreshed conversations list with", allConversations.length, "conversations");
                  break; // Success, exit the retry loop
                } else {
                  console.log("[MESSAGING] Target conversation not found, will retry...");
                  attempts++;

                  if (attempts < maxAttempts) {
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // 1s, 2s
                  }
                }
              } catch (error) {
                console.error(`[MESSAGING] Error refreshing conversations on attempt ${attempts + 1}:`, error);
                attempts++;

                if (attempts >= maxAttempts) {
                  break;
                }

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
              }
            }

            if (attempts >= maxAttempts) {
              console.error("[MESSAGING] Failed to find conversation after", maxAttempts, "attempts");
            }
          }

          // If it's the active conversation, also update the UI state
          if (newMessage.conversation_id === activeConversationIdRef.current) {
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
              } else if (isOwnMessage) {
                // For own messages, replace any optimistic message with the real one
                setThreadMessages((prev) => {
                  // Check if there's an optimistic message (temp ID) to replace
                  const optimisticIndex = prev.findIndex(
                    (msg) =>
                      msg.id.startsWith("temp-") &&
                      msg.authorId === newMessage.author_id
                  );
                  if (optimisticIndex >= 0) {
                    const updated = [...prev];
                    updated[optimisticIndex] = newMsg;
                    return updated;
                  }
                  // If no optimistic message, check if real message already exists
                  const exists = prev.some((msg) => msg.id === newMessage.id);
                  return exists ? prev : [...prev, newMsg];
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
            } else {
              // Top-level message
              if (isOwnMessage) {
                // For own messages, replace any optimistic message with the real one
                setMessages((prev) => {
                  // Check if there's an optimistic message (temp ID) to replace
                  const optimisticIndex = prev.findIndex(
                    (msg) =>
                      msg.id.startsWith("temp-") &&
                      msg.authorId === newMessage.author_id
                  );
                  if (optimisticIndex >= 0) {
                    const updated = [...prev];
                    updated[optimisticIndex] = newMsg;
                    return updated;
                  }
                  // If no optimistic message, check if real message already exists
                  const exists = prev.some((msg) => msg.id === newMessage.id);
                  return exists ? prev : [...prev, newMsg];
                });
              } else {
                // Other users' messages
                setMessages((prev) => {
                  const messageExists = prev.some(
                    (msg) => msg.id === newMessage.id
                  );
                  if (messageExists) return prev;
                  return [...prev, newMsg];
                });
              }
            }

            // Mark as read if viewing (but don't refetch messages)
            // Only mark if this is the active conversation
            if (
              !isOwnMessage &&
              newMessage.conversation_id === activeConversationIdRef.current
            ) {
              debouncedMarkAsRead(newMessage.conversation_id);
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
            cachedUserId = currentUser?.id || null;

            // Update unread messages notification
            const totalUnread = updated.reduce(
              (sum, conv) => sum + (conv.unreadCount || 0),
              0
            );
            if (currentUser?.email) {
              updateUnreadMessagesNotification(
                currentUser.email,
                totalUnread
              ).catch((error) => {
                console.error(
                  "[MESSAGING] Error updating unread messages notification:",
                  error
                );
              });
            }

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
      supabase.removeChannel(conversationsChannel);
      // Clear any pending markAsRead timeout
      if (markAsReadTimeoutRef.current) {
        clearTimeout(markAsReadTimeoutRef.current);
        markAsReadTimeoutRef.current = null;
      }
    };
  }, [currentUser?.id, debouncedMarkAsRead]);

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

      // Invalidate files cache if a file was uploaded
      if (fileAttachment) {
        invalidateFilesCache(activeConversationId);
        console.log("[FILES] Cache invalidated after file upload");
      }

      if (sentMessage) {
        // Replace optimistic message with real one
        if (parentMessageId) {
          setThreadMessages((prev) => {
            const optimisticIndex = prev.findIndex(
              (msg) => msg.id === optimisticMessage.id
            );
            if (optimisticIndex >= 0) {
              // Replace optimistic message
              const updated = [...prev];
              updated[optimisticIndex] = sentMessage;
              return updated;
            } else {
              // Optimistic message not found, just add the real one
              // Check if real message already exists to avoid duplicates
              const exists = prev.some((msg) => msg.id === sentMessage.id);
              return exists ? prev : [...prev, sentMessage];
            }
          });
        } else {
          setMessages((prev) => {
            const optimisticIndex = prev.findIndex(
              (msg) => msg.id === optimisticMessage.id
            );
            if (optimisticIndex >= 0) {
              // Replace optimistic message
              const updated = [...prev];
              updated[optimisticIndex] = sentMessage;
              return updated;
            } else {
              // Optimistic message not found, just add the real one
              // Check if real message already exists to avoid duplicates
              const exists = prev.some((msg) => msg.id === sentMessage.id);
              return exists ? prev : [...prev, sentMessage];
            }
          });
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
            // Replace optimistic message in cache or add if not found
            const optimisticIndex = cacheEntry.messages.findIndex(
              (msg) => msg.id === optimisticMessage.id
            );
            if (optimisticIndex >= 0) {
              const updatedMessages = [...cacheEntry.messages];
              updatedMessages[optimisticIndex] = sentMessage;
              messagesCacheMap.set(activeConversationId, {
                messages: updatedMessages,
              });
            } else {
              // Optimistic message not found in cache, add the real one
              const exists = cacheEntry.messages.some(
                (msg) => msg.id === sentMessage.id
              );
              if (!exists) {
                messagesCacheMap.set(activeConversationId, {
                  messages: [...cacheEntry.messages, sentMessage],
                });
              }
            }
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
          cachedUserId = currentUser?.id || null;

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

    console.log("[MESSAGING] Creating DM with user:", userId);

    try {
      // The API will return existing DM if one exists, or create a new one
      // No need to check client-side - let the API handle duplicate prevention
      const conversation = await createDM(userId);

      console.log("[MESSAGING] DM creation result:", conversation);

      if (conversation) {
        // Check if conversation already exists in our list
        const existingIndex = conversations.findIndex(
          (conv) => conv.id === conversation.id
        );

        if (existingIndex >= 0) {
          // Conversation already exists, just switch to it
          setActiveConversationId(conversation.id);
          setShowCreateChannel(false);
          toast.success("Opened existing conversation");
        } else {
          // New conversation, add it to the list
          console.log("[MESSAGING] Adding new DM to conversation list:", conversation.id);
          setConversations((prev) => {
            const updated = [conversation, ...prev];
            conversationsCache = updated;
            cachedUserId = currentUser?.id || null;
            console.log("[MESSAGING] Updated conversations cache with", updated.length, "conversations");
            return updated;
          });
          setActiveConversationId(conversation.id);
          setShowCreateChannel(false);
          toast.success("Conversation started");
        }
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

  // Search handlers - memoized to prevent infinite loops
  const handleCloseSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery("");
    setActiveSearchResultId("");
    setSearchResultIds([]);
  }, []);

  const handleSearchResultChange = useCallback(
    (resultIndex: number, messageId: string, allResultIds: string[]) => {
      // Use setTimeout to defer state update to avoid setState during render
      setTimeout(() => {
        setActiveSearchResultId(messageId);
        setSearchResultIds(allResultIds);
      }, 0);
    },
    []
  );

  const handleLoadSearchMessage = useCallback(
    async (messageId: string) => {
      if (!activeConversationId || isLoadingSearchMessage) return;

      try {
        setIsLoadingSearchMessage(true);
        // Check if message is already loaded
        const isLoaded = messages.some((m) => m.id === messageId);
        if (isLoaded) {
          // Message is already loaded, just scroll to it
          setActiveSearchResultId(messageId);
          setIsLoadingSearchMessage(false);
          return;
        }

        // Load messages around the target message
        const contextMessages = await getMessagesAround(
          activeConversationId,
          messageId,
          20
        );

        if (contextMessages.length > 0) {
          // Merge with existing messages, avoiding duplicates
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newMessages = contextMessages.filter(
              (m) => !existingIds.has(m.id)
            );

            if (newMessages.length === 0) return prev;

            // Combine and sort by creation date
            const combined = [...prev, ...newMessages].sort(
              (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
            );

            // Update cache
            messagesCacheMap.set(activeConversationId, {
              messages: combined,
            });

            return combined;
          });

          // Wait for React to update DOM, then set active search result
          // Use requestAnimationFrame to ensure DOM is ready
          requestAnimationFrame(() => {
            setTimeout(() => {
              setActiveSearchResultId(messageId);
            }, 50);
          });
        }
      } catch (error) {
        console.error("Error loading search message:", error);
        toast.error("Failed to load message");
      } finally {
        setIsLoadingSearchMessage(false);
      }
    },
    [activeConversationId, isLoadingSearchMessage, messages]
  );

  return (
    <div className="h-full w-full bg-black relative" role="main">
      {/* Desktop Layout */}
      <div className="hidden lg:flex h-full">
        {/* Desktop Sidebar */}
        <div className="relative z-0 w-80 border-r border-gray-800 flex flex-col bg-gray-900/50">
          {/* Header */}
          <div className="p-4 border-b border-gray-800 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <MessageSquare size={24} />
                Messages
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Refresh conversations and messages"
                >
                  <RefreshCw
                    size={20}
                    className={isRefreshing ? "animate-spin" : ""}
                    aria-hidden="true"
                  />
                  <span className="text-sm hidden sm:inline">Refresh</span>
                </button>
                <button
                  onClick={() => setShowCreateChannel(true)}
                  className="p-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition cursor-pointer flex items-center justify-center"
                  aria-label="Create new conversation or channel"
                >
                  <Plus size={20} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Conversation Search */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search channels and DMs..."
                value={conversationSearchQuery}
                onChange={(e) => setConversationSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              {conversationSearchQuery && (
                <button
                  onClick={() => setConversationSearchQuery("")}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              )}
            </div>
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
              searchQuery={conversationSearchQuery}
            />
          )}
        </div>

        {/* Desktop Main Chat Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {activeConversation ? (
          <>
            {/* Chat Header */}
            <div className="flex-shrink-0 border-b border-gray-800 bg-gray-900">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Avatar for DM or Icon for Channel */}
                  {activeConversation.type === "channel" ? (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center">
                      <Hash size={20} className="text-white" />
                    </div>
                  ) : (
                    (() => {
                      const other = getOtherParticipant(activeConversation);
                      return (
                        <Avatar
                          src={other?.avatarUrl || null}
                          name={other?.username || other?.fullname || undefined}
                          email={other?.email || undefined}
                          size="lg"
                        />
                      );
                    })()
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
                    onClick={() => setIsSearchOpen(true)}
                    className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition cursor-pointer flex items-center gap-2"
                    aria-label="Search messages in conversation (Ctrl+F)"
                  >
                    <Search size={20} aria-hidden="true" />
                    <span className="text-sm hidden sm:inline">Search</span>
                  </button>
                  <button
                    onClick={() => setIsPinnedMessagesOpen(true)}
                    className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition cursor-pointer flex items-center gap-2"
                    aria-label="View pinned messages"
                  >
                    <Pin size={20} aria-hidden="true" />
                    <span className="text-sm hidden sm:inline">Pinned</span>
                  </button>
                  <button
                    onClick={() => setShowFilesModal(true)}
                    className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition cursor-pointer flex items-center gap-2"
                    aria-label="View shared files"
                  >
                    <FolderOpen size={20} aria-hidden="true" />
                    <span className="text-sm hidden sm:inline">Files</span>
                  </button>

                  {activeConversation?.type === "channel" && (
                    <button
                      onClick={() => setIsKanbanModalOpen(true)}
                      className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition cursor-pointer flex items-center gap-2"
                      aria-label="Open Kanban board for project management"
                    >
                      <KanbanSquare size={20} aria-hidden="true" />
                      <span className="text-sm hidden sm:inline">Kanban</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Search Bar */}
              <MessageSearch
                messages={messages}
                conversationId={activeConversationId || ""}
                isOpen={isSearchOpen}
                onClose={handleCloseSearch}
                onResultChange={handleSearchResultChange}
                onQueryChange={setSearchQuery}
                onLoadMessage={handleLoadSearchMessage}
              />
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
                  conversationId={activeConversationId || ""}
                  onMessageClick={(messageId) => setThreadParentId(messageId)}
                  onLoadMore={loadOlderMessages}
                  hasMore={
                    activeConversationId
                      ? hasMoreMessages[activeConversationId] || false
                      : false
                  }
                  isLoadingMore={isLoadingOlderMessages}
                  searchQuery={searchQuery}
                  activeSearchResultId={activeSearchResultId}
                  allSearchResults={searchResultIds}
                  pinnedMessageIds={pinnedMessageIds}
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
    </div>

    {/* Mobile Layout */}
    <div className="lg:hidden h-full">
      {!activeConversationId ? (
        /* Conversations List View */
        <div className="h-full flex flex-col bg-gray-900/50">
          {/* Header */}
          <div className="p-4 border-b border-gray-800 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <MessageSquare size={24} />
                Messages
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Refresh conversations and messages"
                >
                  <RefreshCw
                    size={20}
                    className={isRefreshing ? "animate-spin" : ""}
                    aria-hidden="true"
                  />
                  <span className="text-sm">Refresh</span>
                </button>
                <button
                  onClick={() => setShowCreateChannel(true)}
                  className="p-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition cursor-pointer flex items-center justify-center"
                  aria-label="Create new conversation or channel"
                >
                  <Plus size={20} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Conversation Search */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search channels and DMs..."
                value={conversationSearchQuery}
                onChange={(e) => setConversationSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
              />
              {conversationSearchQuery && (
                <button
                  onClick={() => setConversationSearchQuery("")}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              )}
            </div>
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
              onSelectConversation={(conversationId) => {
                handleSelectConversation(conversationId);
              }}
              onOpenChannelSettings={(conversationId) =>
                setShowChannelSettingsForId(conversationId)
              }
              searchQuery={conversationSearchQuery}
            />
          )}
        </div>
      ) : activeConversation ? (
        /* Chat View with Back Button */
        <div className="h-full flex flex-col bg-black">
          {/* Chat Header with Back Button */}
          <div className="flex-shrink-0 border-b border-gray-800 bg-gray-900">
            <div className="p-3 flex items-center gap-2">
              <button
                onClick={() => setActiveConversationId(null)}
                className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition cursor-pointer"
                title="Back to conversations"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-2">
                {/* Avatar for DM or Icon for Channel */}
                {activeConversation.type === "channel" ? (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center">
                    <Hash size={16} className="text-white" />
                  </div>
                ) : (
                  (() => {
                    const other = getOtherParticipant(activeConversation);
                    return (
                      <Avatar
                        src={other?.avatarUrl || null}
                        name={other?.username || other?.fullname || undefined}
                        email={other?.email || undefined}
                        size="sm"
                      />
                    );
                  })()
                )}
                <div>
                  <h3 className="text-white font-semibold text-base">
                    {getConversationDisplayName(activeConversation)}
                  </h3>
                  {activeConversation.type === "dm" ? (
                    <p className="text-[10px] text-gray-400">
                      {getOtherParticipant(activeConversation)?.email || ""}
                    </p>
                  ) : (
                    activeConversation.description && (
                      <p className="text-[10px] text-gray-400">
                        {activeConversation.description}
                      </p>
                    )
                  )}
                </div>
              </div>

              {/* 3-dot Menu for Actions */}
              <div className="ml-auto relative">
                <button
                  onClick={() => setShowActionMenu(!showActionMenu)}
                  className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition cursor-pointer"
                  title="More actions"
                >
                  <MoreVertical size={16} />
                </button>

                {showActionMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg py-1 z-10 min-w-[140px]">
                    <button
                      onClick={() => {
                        setIsSearchOpen(true);
                        setShowActionMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2 cursor-pointer"
                    >
                      <Search size={14} />
                      Search
                    </button>
                    <button
                      onClick={() => {
                        setIsPinnedMessagesOpen(true);
                        setShowActionMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2 cursor-pointer"
                    >
                      <Pin size={14} />
                      Pinned
                    </button>
                    <button
                      onClick={() => {
                        setShowFilesModal(true);
                        setShowActionMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2 cursor-pointer"
                    >
                      <FolderOpen size={14} />
                      Files
                    </button>
                    {activeConversation?.type === "channel" && (
                      <button
                        onClick={() => {
                          setIsKanbanModalOpen(true);
                          setShowActionMenu(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2 cursor-pointer"
                      >
                        <KanbanSquare size={14} />
                        Kanban
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Search Bar */}
            <MessageSearch
              messages={messages}
              conversationId={activeConversationId || ""}
              isOpen={isSearchOpen}
              onClose={handleCloseSearch}
              onResultChange={handleSearchResultChange}
              onQueryChange={setSearchQuery}
              onLoadMessage={handleLoadSearchMessage}
            />
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
                conversationId={activeConversationId || ""}
                onMessageClick={(messageId) => setThreadParentId(messageId)}
                onLoadMore={loadOlderMessages}
                hasMore={
                  activeConversationId
                    ? hasMoreMessages[activeConversationId] || false
                    : false
                }
                isLoadingMore={isLoadingOlderMessages}
                searchQuery={searchQuery}
                activeSearchResultId={activeSearchResultId}
                allSearchResults={searchResultIds}
                pinnedMessageIds={pinnedMessageIds}
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

          {/* Thread Panel Overlay */}
          {threadParentId && (
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
      ) : null}
    </div>

    {/* Modals - outside the responsive layout */}
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

    {showCreateChannel && (
      <CreateChannelModal
        onClose={() => setShowCreateChannel(false)}
        onCreate={handleCreateChannel}
        onCreateDM={handleCreateDM}
      />
    )}

    {activeConversation && (
      <FilesModal
        isOpen={showFilesModal}
        onClose={() => setShowFilesModal(false)}
        conversationId={activeConversation.id}
        conversationName={getConversationDisplayName(activeConversation)}
      />
    )}

    <RemindersModal
      key={showRemindersModal ? 'open' : 'closed'}
      isOpen={showRemindersModal}
      onClose={() => {
        setShowRemindersModal(false);
        setInitialEditingReminder(null);
        setForceShowCreateForm(false);
      }}
      reminders={reminders}
      setReminders={setReminders}
      channelId={activeConversation?.type === "channel" ? (activeConversationId || undefined) : undefined}
      initialShowForm={!!initialEditingReminder}
      initialEditingReminder={initialEditingReminder}
      forceShowCreateForm={forceShowCreateForm}
    />

    {activeConversation && (
      <PinnedMessagesPanel
        conversationId={activeConversation.id}
        isOpen={isPinnedMessagesOpen}
        onClose={() => setIsPinnedMessagesOpen(false)}
        onMessageClick={handleLoadSearchMessage}
      />
    )}

    {activeConversation?.type === "channel" && (
      <div
        className={`fixed inset-0 z-50 transition-opacity duration-300 ${
          isKanbanModalOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          onClick={() => setIsKanbanModalOpen(false)}
        />
        <div className="absolute inset-4 md:inset-8 lg:inset-12 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          <div className="flex-shrink-0 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm">
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center">
                  <KanbanSquare size={18} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {getConversationDisplayName(activeConversation)} - Kanban Board
                  </h2>
                  <p className="text-sm text-gray-400">
                    Project management for this channel
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsKanbanModalOpen(false)}
                className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition cursor-pointer"
                title="Close Kanban board"
              >
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <KanbanView
              reminders={reminders}
              setReminders={setReminders}
              channelId={activeConversationId || undefined}
              onOpenTaskModal={handleOpenTaskModal}
            />
          </div>
        </div>
      </div>
    )}

    <JoinChannelModal
      isOpen={showJoinChannelModal}
      channel={channelToJoin}
      onClose={() => {
        setShowJoinChannelModal(false);
        setChannelToJoin(null);
      }}
      onJoin={handleJoinChannel}
      isJoining={isJoiningChannel}
    />
  </div>
  );
}
