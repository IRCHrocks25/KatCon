"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Download, FileText, Image as ImageIcon, Archive, File } from "lucide-react";
import type { Message, ConversationParticipant } from "@/lib/supabase/messaging";
import { formatMentions } from "@/lib/utils/mentions";
import { MessageInput } from "./MessageInput";
import { formatFileSize, isImageFile } from "@/lib/supabase/file-upload";

interface ThreadPanelProps {
  parentMessage: Message | undefined;
  threadMessages: Message[];
  participants: ConversationParticipant[];
  currentUserId: string;
  onClose: () => void;
  onSendReply: (content: string, files?: File[]) => void;
  isLoading: boolean;
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
      className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4"
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

// File attachment display component for thread
function ThreadFileAttachment({
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
    if (isImage) return <ImageIcon size={16} className="text-blue-400" />;
    if (fileType.includes("pdf") || fileType.includes("word") || fileType.includes("text"))
      return <FileText size={16} className="text-orange-400" />;
    if (fileType.includes("zip") || fileType.includes("rar") || fileType.includes("7z"))
      return <Archive size={16} className="text-yellow-400" />;
    return <File size={16} className="text-gray-400" />;
  };

  if (isImage) {
    return (
      <>
        <div className="mt-2 relative group">
          <img
            src={fileUrl}
            alt={fileName}
            className="max-w-[200px] max-h-[150px] object-cover rounded-lg cursor-pointer hover:opacity-90 transition"
            onClick={() => setShowLightbox(true)}
          />
          <a
            href={fileUrl}
            download={fileName}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-2 right-2 p-1 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition hover:bg-black/80"
            title="Download"
          >
            <Download size={14} className="text-white" />
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
      className={`mt-2 p-2 rounded-lg flex items-center gap-2 ${
        isOwnMessage
          ? "bg-white/10"
          : "bg-gray-700/50 border border-gray-600"
      }`}
    >
      <div className="flex-shrink-0">{getFileIcon()}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{fileName}</p>
        <p className="text-[10px] opacity-70">{formatFileSize(fileSize)}</p>
      </div>
      <a
        href={fileUrl}
        download={fileName}
        className={`p-1.5 rounded-full transition flex-shrink-0 ${
          isOwnMessage
            ? "hover:bg-white/20 text-white"
            : "hover:bg-gray-600 text-gray-300"
        }`}
        title="Download"
      >
        <Download size={14} />
      </a>
    </div>
  );
}

export function ThreadPanel({
  parentMessage,
  threadMessages,
  participants,
  currentUserId,
  onClose,
  onSendReply,
  isLoading,
}: ThreadPanelProps) {
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages]);

  const getParticipantName = (userId: string) => {
    const participant = participants.find((p) => p.userId === userId);
    return participant?.fullname || participant?.email || "Unknown";
  };

  const getParticipantInitials = (userId: string) => {
    const name = getParticipantName(userId);
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (!parentMessage) return null;

  const parentHasFile = parentMessage.fileUrl && parentMessage.fileName;
  const parentHasContent = parentMessage.content && parentMessage.content.trim().length > 0;

  return (
    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex">
      <div className="w-full md:w-96 bg-gray-900 border-l border-gray-800 flex flex-col">
        {/* Header */}
        <div className="p-3 md:p-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-white font-medium text-base md:text-lg">Thread</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-800 rounded transition"
          >
            <X size={18} className="md:w-5 md:h-5 text-gray-400" />
          </button>
        </div>

        {/* Parent Message */}
        <div className="p-3 md:p-4 border-b border-gray-800">
          <div className="flex gap-2 md:gap-3">
            <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center text-white text-[10px] md:text-xs font-medium flex-shrink-0">
              {getParticipantInitials(parentMessage.authorId)}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white font-medium text-sm">
                  {getParticipantName(parentMessage.authorId)}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(parentMessage.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg px-2 md:px-3 py-2 text-gray-100 text-sm">
                {parentHasContent && formatMentions(
                  parentMessage.content,
                  participants.map((p) => ({
                    id: p.userId,
                    email: p.email,
                    fullname: p.fullname,
                  }))
                )}
                {parentHasFile && (
                  <ThreadFileAttachment
                    fileUrl={parentMessage.fileUrl!}
                    fileName={parentMessage.fileName!}
                    fileType={parentMessage.fileType || "application/octet-stream"}
                    fileSize={parentMessage.fileSize || 0}
                    isOwnMessage={false}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Thread Replies */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 md:space-y-4 custom-scrollbar">
          {threadMessages.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <p className="text-sm">No replies yet</p>
            </div>
          ) : (
            threadMessages.map((message) => {
              const isOwnMessage = message.authorId === currentUserId;
              const hasFile = message.fileUrl && message.fileName;
              const hasContent = message.content && message.content.trim().length > 0;

              return (
                <div
                  key={message.id}
                  className={`flex gap-3 ${isOwnMessage ? "flex-row-reverse" : "flex-row"}`}
                >
                  <div className="w-6 h-6 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                    {getParticipantInitials(message.authorId)}
                  </div>
                  <div
                    className={`flex flex-col max-w-[80%] ${isOwnMessage ? "items-end" : "items-start"}`}
                  >
                    <span className="text-white text-xs font-medium mb-1">
                      {getParticipantName(message.authorId)}
                    </span>
                    <div
                      className={`px-3 py-2 rounded-lg text-sm ${
                        isOwnMessage
                          ? "bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500 text-white"
                          : "bg-gray-800 text-gray-100 border border-gray-700"
                      }`}
                    >
                      {hasContent && formatMentions(
                        message.content,
                        participants.map((p) => ({
                          id: p.userId,
                          email: p.email,
                          fullname: p.fullname,
                        }))
                      )}
                      {hasFile && (
                        <ThreadFileAttachment
                          fileUrl={message.fileUrl!}
                          fileName={message.fileName!}
                          fileType={message.fileType || "application/octet-stream"}
                          fileSize={message.fileSize || 0}
                          isOwnMessage={isOwnMessage}
                        />
                      )}
                    </div>
                    <span className={`text-[10px] text-gray-500 mt-1 ${isOwnMessage ? "text-right" : "text-left"}`}>
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              );
            })
          )}
          <div ref={threadEndRef} />
        </div>

        {/* Reply Input */}
        <div className="border-t border-gray-800">
          <MessageInput
            onSend={onSendReply}
            isLoading={isLoading}
            participants={participants}
          />
        </div>
      </div>
    </div>
  );
}
