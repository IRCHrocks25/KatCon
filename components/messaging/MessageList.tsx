"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Download,
  FileText,
  Image as ImageIcon,
  Archive,
  File,
  X,
  Pin,
} from "lucide-react";
import type {
  Message,
  ConversationParticipant,
} from "@/lib/supabase/messaging";
import { formatMentions } from "@/lib/utils/mentions";
import { highlightSearchMatches } from "@/lib/utils/search-highlight";
import { formatFileSize, isImageFile } from "@/lib/supabase/file-upload";
import { Avatar } from "@/components/ui/avatar";
import { MessageReactions } from "./MessageReactions";
import { MessageActionsMenu } from "./MessageActionsMenu";
import { useUserStatuses } from "@/hooks/useUserStatuses";

interface MessageListProps {
  messages: Message[];
  participants: ConversationParticipant[];
  currentUserId: string;
  conversationId: string;
  onMessageClick: (messageId: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  searchQuery?: string;
  activeSearchResultId?: string;
  allSearchResults?: string[]; // Array of message IDs that match search
  searchResultIds?: string[]; // Alias for allSearchResults for compatibility
  pinnedMessageIds?: string[]; // Array of pinned message IDs
}

// Image lightbox component
function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 bg-gray-800 rounded-full text-white hover:bg-gray-700 transition"
      >
        <X size={24} />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </motion.div>
  );
}

// File attachment display component
function FileAttachment({
  fileUrl,
  fileName,
  fileType,
  fileSize,
  isOwnMessage,
}: {
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  isOwnMessage: boolean;
}) {
  const [showLightbox, setShowLightbox] = useState(false);
  const isImage = isImageFile(fileType);

  const getFileIcon = () => {
    if (isImage) return <ImageIcon size={20} className="text-blue-400" />;
    if (
      fileType.includes("pdf") ||
      fileType.includes("word") ||
      fileType.includes("text")
    )
      return <FileText size={20} className="text-orange-400" />;
    if (
      fileType.includes("zip") ||
      fileType.includes("rar") ||
      fileType.includes("7z")
    )
      return <Archive size={20} className="text-yellow-400" />;
    return <File size={20} className="text-gray-400" />;
  };

  if (isImage) {
    return (
      <>
        <div className="mt-2 relative group">
          <img
            src={fileUrl}
            alt={fileName}
            className="max-w-[300px] max-h-[200px] object-cover rounded-lg cursor-pointer hover:opacity-90 transition"
            onClick={() => setShowLightbox(true)}
          />
          <a
            href={fileUrl}
            download={fileName}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition hover:bg-black/80"
            title="Download"
          >
            <Download size={16} className="text-white" />
          </a>
        </div>
        <AnimatePresence>
          {showLightbox && (
            <ImageLightbox
              src={fileUrl}
              alt={fileName}
              onClose={() => setShowLightbox(false)}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  // Non-image file
  return (
    <div
      className={`mt-2 p-3 rounded-lg flex items-center gap-3 ${
        isOwnMessage ? "bg-white/10" : "bg-gray-700/50 border border-gray-600"
      }`}
    >
      <div className="flex-shrink-0">{getFileIcon()}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{fileName}</p>
        <p className="text-xs opacity-70">{formatFileSize(fileSize)}</p>
      </div>
      <a
        href={fileUrl}
        download={fileName}
        className={`p-2 rounded-full transition flex-shrink-0 ${
          isOwnMessage
            ? "hover:bg-white/20 text-white"
            : "hover:bg-gray-600 text-gray-300"
        }`}
        title="Download"
      >
        <Download size={18} />
      </a>
    </div>
  );
}

export function MessageList({
  messages,
  participants,
  currentUserId,
  conversationId,
  onMessageClick,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  searchQuery = "",
  activeSearchResultId = "",
  allSearchResults = [],
  searchResultIds = [],
  pinnedMessageIds = [],
}: MessageListProps) {
  // Use searchResultIds if allSearchResults is empty (for backward compatibility)
  const effectiveSearchResults =
    allSearchResults.length > 0 ? allSearchResults : searchResultIds;
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<
    string | null
  >(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const previousMessageCount = useRef(0);
  const lastConversationId = useRef<string | null>(null);
  const activeResultRef = useRef<HTMLDivElement>(null);

  // Fetch user statuses for all message authors
  const authorIds = useMemo(() => {
    const uniqueIds = new Set(messages.map((m) => m.authorId));
    return Array.from(uniqueIds);
  }, [messages]);

  const { statuses: userStatuses } = useUserStatuses(authorIds);

  // Detect conversation change by checking first message's conversationId
  const currentConversationId = useMemo(() => {
    return messages.length > 0 ? messages[0].conversationId : null;
  }, [messages]);

  const [isNewConversation, setIsNewConversation] = useState(false);

  useEffect(() => {
    const wasNewConversation =
      currentConversationId !== lastConversationId.current;
    setIsNewConversation(wasNewConversation);
    if (wasNewConversation) {
      lastConversationId.current = currentConversationId;
    }
  }, [currentConversationId]);

  // Force scroll to bottom when switching to a conversation (including coming back to it)
  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (container && messages.length > 0 && isNewConversation) {
      // Directly set scroll position to bottom
      container.scrollTop = container.scrollHeight;
      lastConversationId.current = currentConversationId;
      previousMessageCount.current = messages.length;
    }
  }, [messages.length > 0, currentConversationId, isNewConversation]);

  // Handle scroll behavior for new messages in the same conversation
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || isNewConversation) return;

    const currentMessageCount = messages.length;
    const messagesAdded = currentMessageCount - previousMessageCount.current;

    // If loading older messages, don't scroll
    if (isLoadingMore && messagesAdded > 0) {
      previousMessageCount.current = currentMessageCount;
      return;
    }

    // For new messages, only scroll if user is near the bottom
    if (messagesAdded > 0) {
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <
        150;

      if (isNearBottom) {
        // Smooth scroll to bottom for new messages
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }

    previousMessageCount.current = currentMessageCount;
  }, [messages, isLoadingMore, isNewConversation]);

  // Scroll to active search result
  useLayoutEffect(() => {
    if (!activeSearchResultId) return;

    // Verify the message exists in the messages array
    const messageExists = messages.some((m) => m.id === activeSearchResultId);
    if (!messageExists) {
      // Message not loaded yet, will scroll when it's loaded
      return;
    }

    const scrollToElement = (element: HTMLElement) => {
      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    };

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      // Additional delay for AnimatePresence animations to complete
      setTimeout(() => {
        // Try ref first (most reliable)
        const element = activeResultRef.current;
        if (element) {
          scrollToElement(element);
          return;
        }

        // Fallback: query DOM directly using data attribute
        const container = messagesContainerRef.current;
        if (container) {
          const queriedElement = container.querySelector(
            `[data-message-id="${activeSearchResultId}"]`
          ) as HTMLElement;
          if (queriedElement) {
            scrollToElement(queriedElement);
            return;
          }
        }

        // Final retry: check ref again after delay
        // This handles the case where React hasn't assigned the ref yet
        setTimeout(() => {
          const retryElement = activeResultRef.current;
          if (retryElement) {
            scrollToElement(retryElement);
          } else if (container) {
            // Last resort: query DOM again
            const finalElement = container.querySelector(
              `[data-message-id="${activeSearchResultId}"]`
            ) as HTMLElement;
            if (finalElement) {
              scrollToElement(finalElement);
            }
          }
        }, 200);
      }, 250); // Increased delay for AnimatePresence
    });
  }, [activeSearchResultId, messages]);

  const getParticipant = (userId: string) => {
    return participants.find((p) => p.userId === userId);
  };

  const getParticipantName = (userId: string) => {
    const participant = getParticipant(userId);
    return (
      participant?.username ||
      participant?.fullname ||
      participant?.email ||
      "Unknown"
    );
  };

  if (messages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <p className="text-lg mb-2">No messages yet</p>
          <p className="text-sm">Start the conversation!</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={messagesContainerRef}
      className="h-full overflow-y-auto p-4 space-y-4 custom-scrollbar"
    >
      {/* Load More Button */}
      {hasMore && (
        <div className="flex justify-center pb-4">
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingMore ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Loading...
              </>
            ) : (
              "Load Older Messages"
            )}
          </button>
        </div>
      )}

      <AnimatePresence>
        {messages.map((message, index) => {
          const isOwnMessage = message.authorId === currentUserId;
          const prevMessage = index > 0 ? messages[index - 1] : null;
          const showAvatar =
            !prevMessage || prevMessage.authorId !== message.authorId;

          const hasFile = message.fileUrl && message.fileName;
          const hasContent =
            message.content && message.content.trim().length > 0;

          const isActiveSearchResult = message.id === activeSearchResultId;
          const hasSearchQuery =
            searchQuery.trim().length > 0 && effectiveSearchResults.length > 0;
          const isSearchResult = effectiveSearchResults.includes(message.id);
          const isPinned = pinnedMessageIds?.includes(message.id) || false;

          return (
            <motion.div
              key={message.id}
              ref={isActiveSearchResult ? activeResultRef : null}
              data-message-id={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`group flex items-start gap-3 ${
                isOwnMessage ? "flex-row-reverse" : "flex-row"
              }`}
            >
              {/* Avatar */}
              {showAvatar ? (
                <div className="mt-5">
                  <Avatar
                    src={
                      message.authorAvatarUrl ||
                      getParticipant(message.authorId)?.avatarUrl ||
                      null
                    }
                    name={
                      message.authorUsername ||
                      message.authorFullname ||
                      getParticipant(message.authorId)?.fullname ||
                      undefined
                    }
                    email={
                      message.authorEmail ||
                      getParticipant(message.authorId)?.email ||
                      undefined
                    }
                    size="sm"
                    statusEmoji={
                      userStatuses[message.authorId]?.statusEmoji || null
                    }
                    showStatusIndicator={true}
                  />
                </div>
              ) : (
                <div className="w-6 flex-shrink-0" />
              )}

              {/* Message Content */}
              <div
                className={`flex flex-col max-w-[70%] relative ${
                  isOwnMessage ? "items-end" : "items-start"
                }`}
              >
                {/* Show name on every message */}
                {showAvatar && (
                  <div
                    className={`text-xs font-semibold mb-1 px-2 flex items-center gap-1 ${
                      isOwnMessage
                        ? "text-right text-purple-300 justify-end"
                        : "text-left text-gray-400 justify-start"
                    }`}
                  >
                    {isPinned && (
                      <Pin
                        size={12}
                        className="text-purple-400 flex-shrink-0"
                      />
                    )}
                    {isOwnMessage
                      ? "You"
                      : getParticipantName(message.authorId)}
                    {/* Status emoji next to name */}
                    {userStatuses[message.authorId]?.statusEmoji && (
                      <span
                        className="text-xs"
                        title={
                          userStatuses[message.authorId]?.statusText ||
                          undefined
                        }
                      >
                        {userStatuses[message.authorId]?.statusEmoji}
                      </span>
                    )}
                  </div>
                )}

                {/* Show pin indicator even when no avatar */}
                {!showAvatar && isPinned && (
                  <div
                    className={`text-xs mb-1 px-2 flex items-center gap-1 ${
                      isOwnMessage
                        ? "text-right justify-end"
                        : "text-left justify-start"
                    }`}
                  >
                    <Pin size={12} className="text-purple-400 flex-shrink-0" />
                  </div>
                )}

                {/* Message bubble with actions menu */}
                <div
                  className={`flex items-start gap-2 ${
                    isOwnMessage ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  <div
                    className={`px-4 py-2 rounded-2xl cursor-pointer ${
                      isOwnMessage
                        ? "bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500 text-white rounded-tr-sm"
                        : "bg-gray-800 text-gray-100 rounded-tl-sm border border-gray-700"
                    }`}
                    onClick={() => onMessageClick(message.id)}
                  >
                    {/* Text content */}
                    {hasContent && (
                      <div className="text-sm whitespace-pre-wrap break-words">
                        {hasSearchQuery && isSearchResult
                          ? highlightSearchMatches(
                              formatMentions(
                                message.content,
                                participants.map((p) => ({
                                  id: p.userId,
                                  email: p.email,
                                  fullname: p.fullname,
                                }))
                              ),
                              searchQuery
                            )
                          : formatMentions(
                              message.content,
                              participants.map((p) => ({
                                id: p.userId,
                                email: p.email,
                                fullname: p.fullname,
                              }))
                            )}
                      </div>
                    )}

                    {/* File attachment */}
                    {hasFile && (
                      <FileAttachment
                        fileUrl={message.fileUrl!}
                        fileName={message.fileName!}
                        fileType={
                          message.fileType || "application/octet-stream"
                        }
                        fileSize={message.fileSize || 0}
                        isOwnMessage={isOwnMessage}
                      />
                    )}
                  </div>

                  {/* Actions Menu - Shows on hover, beside message */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                    <MessageActionsMenu
                      messageId={message.id}
                      conversationId={conversationId}
                      isPinned={isPinned}
                      isOwnMessage={isOwnMessage}
                      onReply={() => onMessageClick(message.id)}
                      onPinChange={() => {
                        // Refresh pinned messages list
                        window.dispatchEvent(
                          new CustomEvent("refreshPinnedMessages")
                        );
                        // Also trigger a refresh of pinned message IDs in parent
                        window.dispatchEvent(
                          new CustomEvent("refreshPinnedMessageIds", {
                            detail: { conversationId },
                          })
                        );
                      }}
                      onAddReaction={() => {
                        setReactionPickerMessageId(message.id);
                      }}
                    />
                  </div>
                </div>

                {/* Timestamp - alone */}
                <div
                  className={`text-[10px] text-gray-500 mt-1 px-2 ${
                    isOwnMessage
                      ? "text-right"
                      : "text-left"
                  }`}
                >
                  {new Date(message.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>

                {/* Read Receipts and Thread replies - below timestamp */}
                <div
                  className={`text-[10px] text-gray-500 mt-1 px-2 flex items-center ${
                    isOwnMessage
                      ? "flex-row-reverse justify-end gap-2"
                      : "flex-row justify-start gap-4"
                  }`}
                >
                  {/* For own messages: reads rightmost, replies on left */}
                  {/* For others' messages: reads leftmost, replies on right */}
                  {(() => {
                    // Only show read receipts on the last message (most recent)
                    const isLastMessage = index === messages.length - 1;
                    const lastMessage = messages[messages.length - 1];
                    const isOwnLastMessage =
                      lastMessage?.authorId === currentUserId;

                    const hasReadReceipts = isLastMessage &&
                      lastMessage.readBy &&
                      lastMessage.readBy.length > 0;

                    const hasThreadReplies = (message.threadReplyCount || 0) > 0;

                    return (
                      <>
                        {/* Read receipts - positioned based on message alignment */}
                        {hasReadReceipts ? (
                          <div className="flex items-center justify-center -space-x-1 min-h-[12px]">
                            {/* For DMs, show if the other person read it */}
                            {participants.length === 2 ? (
                              lastMessage.readBy.some(
                                (userId) =>
                                  userId !== currentUserId &&
                                  participants.some((p) => p.userId === userId)
                              ) ? (
                                <div className="text-blue-400" title="Read">
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                  >
                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                  </svg>
                                </div>
                              ) : (
                                <div className="text-gray-500" title="Sent">
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                  >
                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                  </svg>
                                </div>
                              )
                            ) : (
                              /* For channels, show all profile pictures of readers (no limit) */
                              (() => {
                                const readers = lastMessage.readBy
                                  .filter((userId) => userId !== currentUserId)
                                  .map((userId) => getParticipant(userId))
                                  .filter(Boolean);

                                return (
                                  <>
                                    {readers.map((reader) => (
                                      <div
                                        key={reader!.userId}
                                        className="relative"
                                        title={`${
                                          reader!.fullname ||
                                          reader!.email ||
                                          "Unknown"
                                        } read this message`}
                                      >
                                        <div className="w-3 h-3">
                                          <Avatar
                                            src={reader!.avatarUrl || null}
                                            name={
                                              reader!.fullname ||
                                              reader!.username ||
                                              undefined
                                            }
                                            email={reader!.email || undefined}
                                            size="sm"
                                            className="w-3 h-3 text-[6px]"
                                            showStatusIndicator={false}
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </>
                                );
                              })()
                            )}
                          </div>
                        ) : null}

                        {/* Thread replies - positioned based on message alignment */}
                        {hasThreadReplies && (
                          <div className="flex items-center justify-center min-h-[12px]">
                            <button
                              onClick={() => onMessageClick(message.id)}
                              className="text-xs text-purple-400 hover:text-purple-300 leading-tight"
                            >
                              {message.threadReplyCount}{" "}
                              {message.threadReplyCount === 1 ? "reply" : "replies"}
                            </button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Message Reactions - Lazy loaded, only fetches when user interacts */}
                <div
                  className={`mt-1 ${
                    isOwnMessage ? "text-right" : "text-left"
                  }`}
                >
                  <MessageReactions
                    messageId={message.id}
                    initialReactions={message.reactions || []}
                    trigger={
                      reactionPickerMessageId === message.id ? "menu" : "button"
                    }
                    isOwnMessage={isOwnMessage}
                    onPickerClose={() => {
                      // Clear the trigger when picker closes
                      if (reactionPickerMessageId === message.id) {
                        setReactionPickerMessageId(null);
                      }
                    }}
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      <div ref={messagesEndRef} />
    </div>
  );
}
