"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Download, FileText, Image as ImageIcon, Archive, File, X } from "lucide-react";
import type {
  Message,
  ConversationParticipant,
} from "@/lib/supabase/messaging";
import { formatMentions } from "@/lib/utils/mentions";
import { formatFileSize, isImageFile } from "@/lib/supabase/file-upload";
import { Avatar } from "@/components/ui/avatar";

interface MessageListProps {
  messages: Message[];
  participants: ConversationParticipant[];
  currentUserId: string;
  onMessageClick: (messageId: string) => void;
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
    if (fileType.includes("pdf") || fileType.includes("word") || fileType.includes("text"))
      return <FileText size={20} className="text-orange-400" />;
    if (fileType.includes("zip") || fileType.includes("rar") || fileType.includes("7z"))
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
        isOwnMessage
          ? "bg-white/10"
          : "bg-gray-700/50 border border-gray-600"
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
  onMessageClick,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getParticipant = (userId: string) => {
    return participants.find((p) => p.userId === userId);
  };

  const getParticipantName = (userId: string) => {
    const participant = getParticipant(userId);
    return participant?.username || participant?.fullname || participant?.email || "Unknown";
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
    <div className="h-full overflow-y-auto p-4 space-y-4 custom-scrollbar">
      <AnimatePresence>
        {messages.map((message, index) => {
          const isOwnMessage = message.authorId === currentUserId;
          const prevMessage = index > 0 ? messages[index - 1] : null;
          const showAvatar =
            !prevMessage || prevMessage.authorId !== message.authorId;

          const hasFile = message.fileUrl && message.fileName;
          const hasContent = message.content && message.content.trim().length > 0;

          return (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`flex items-start gap-3 ${
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
                  />
                </div>
              ) : (
                <div className="w-6 flex-shrink-0" />
              )}

              {/* Message Content */}
              <div
                className={`flex flex-col max-w-[70%] ${
                  isOwnMessage ? "items-end" : "items-start"
                }`}
              >
                {/* Show name on every message */}
                {showAvatar && (
                  <div
                    className={`text-xs font-semibold mb-1 px-2 ${
                      isOwnMessage
                        ? "text-right text-purple-300"
                        : "text-left text-gray-400"
                    }`}
                  >
                    {isOwnMessage
                      ? "You"
                      : getParticipantName(message.authorId)}
                  </div>
                )}

                {/* Message bubble */}
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
                      {formatMentions(
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
                      fileType={message.fileType || "application/octet-stream"}
                      fileSize={message.fileSize || 0}
                      isOwnMessage={isOwnMessage}
                    />
                  )}
                </div>

                {/* Timestamp */}
                <div
                  className={`text-[10px] text-gray-500 mt-1 px-2 ${
                    isOwnMessage ? "text-right" : "text-left"
                  }`}
                >
                  {new Date(message.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>

                {/* Thread replies count */}
                {(message.threadReplyCount || 0) > 0 && (
                  <button
                    onClick={() => onMessageClick(message.id)}
                    className="text-xs text-purple-400 hover:text-purple-300 mt-1 px-2"
                  >
                    {message.threadReplyCount}{" "}
                    {message.threadReplyCount === 1 ? "reply" : "replies"}
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      <div ref={messagesEndRef} />
    </div>
  );
}
