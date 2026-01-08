"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Paperclip, X, FileText, Image, Archive, File, Trash2, Smile } from "lucide-react";
import dynamic from "next/dynamic";
import type { EmojiClickData } from "emoji-picker-react";
import { Theme } from "emoji-picker-react";
import type { ConversationParticipant } from "@/lib/supabase/messaging";
import {
  validateFile,
  isImageFile,
  ALLOWED_MIME_TYPES,
} from "@/lib/supabase/file-upload";

// Dynamically import EmojiPicker to avoid SSR issues
const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: () => <div className="w-8 h-8 animate-pulse bg-gray-700 rounded" />,
});

const MAX_FILES = 5;

interface MessageInputProps {
  onSend: (content: string, files?: File[]) => void;
  isLoading: boolean;
  participants: ConversationParticipant[];
}

interface FileWithPreview {
  file: File;
  previewUrl: string | null;
  id: string;
}

export function MessageInput({
  onSend,
  isLoading,
  participants,
}: MessageInputProps) {
  const [content, setContent] = useState("");
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<FileWithPreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Handle mention autocomplete
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleInput = () => {
      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = content.substring(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");

      if (lastAtIndex !== -1) {
        const query = textBeforeCursor.substring(lastAtIndex + 1);
        const hasSpace = query.includes(" ");

        if (hasSpace || query.length === 0) {
          setShowMentionSuggestions(false);
        } else {
          setMentionQuery(query);
          setShowMentionSuggestions(true);
        }
      } else {
        setShowMentionSuggestions(false);
      }
    };

    textarea.addEventListener("keyup", handleInput);
    textarea.addEventListener("click", handleInput);

    return () => {
      textarea.removeEventListener("keyup", handleInput);
      textarea.removeEventListener("click", handleInput);
    };
  }, [content]);

  // Cleanup preview URLs on unmount
  // Use ref to track current selectedFiles for cleanup
  const selectedFilesRef = useRef(selectedFiles);
  useEffect(() => {
    selectedFilesRef.current = selectedFiles;
  }, [selectedFiles]);

  useEffect(() => {
    return () => {
      selectedFilesRef.current.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount/unmount

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showEmojiPicker]);

  const filteredParticipants = participants.filter((p) => {
    if (!mentionQuery) return false;
    const emailPrefix = p.email.split("@")[0].toLowerCase();
    const fullname = (p.fullname || "").toLowerCase();
    const query = mentionQuery.toLowerCase();
    return emailPrefix.includes(query) || fullname.includes(query);
  });

  const insertMention = (participant: ConversationParticipant) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = content.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    const textAfterCursor = content.substring(cursorPos);

    const mentionText = participant.fullname || participant.email.split("@")[0];
    const newContent =
      content.substring(0, lastAtIndex) + `@${mentionText} ` + textAfterCursor;

    setContent(newContent);
    setShowMentionSuggestions(false);
    setMentionQuery("");

    // Focus back on textarea
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = lastAtIndex + mentionText.length + 2;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const addFiles = useCallback((files: FileList | File[]) => {
    setFileError(null);
    const fileArray = Array.from(files);
    
    // Check total count
    const currentCount = selectedFiles.length;
    const newCount = fileArray.length;
    
    if (currentCount + newCount > MAX_FILES) {
      setFileError(`Maximum ${MAX_FILES} files allowed. You can add ${MAX_FILES - currentCount} more.`);
      return;
    }

    const validFiles: FileWithPreview[] = [];
    
    for (const file of fileArray) {
      const error = validateFile(file);
      if (error) {
        setFileError(`${file.name}: ${error.message}`);
        continue;
      }
      
      const previewUrl = isImageFile(file.type) ? URL.createObjectURL(file) : null;
      validFiles.push({
        file,
        previewUrl,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      });
    }

    if (validFiles.length > 0) {
      setSelectedFiles((prev) => [...prev, ...validFiles]);
    }
  }, [selectedFiles.length]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    // Reset input value so same file can be selected again
    e.target.value = "";
  };

  const handleRemoveFile = (id: string) => {
    setSelectedFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
    setFileError(null);
  };

  const handleClearAllFiles = () => {
    selectedFiles.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setSelectedFiles([]);
    setFileError(null);
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the dropzone entirely
    const rect = dropZoneRef.current?.getBoundingClientRect();
    if (rect) {
      const { clientX, clientY } = e;
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        setIsDragging(false);
      }
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const newContent =
      content.substring(0, cursorPos) +
      emojiData.emoji +
      content.substring(cursorPos);

    setContent(newContent);
    setShowEmojiPicker(false);

    // Focus back on textarea and move cursor after emoji
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = cursorPos + emojiData.emoji.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleSend = () => {
    const hasContent = content.trim().length > 0;
    const hasFiles = selectedFiles.length > 0;

    if ((hasContent || hasFiles) && !isLoading) {
      const files = selectedFiles.map((f) => f.file);
      onSend(content, files.length > 0 ? files : undefined);
      
      // Cleanup preview URLs
      selectedFiles.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
      
      setContent("");
      setSelectedFiles([]);
      setFileError(null);
      setShowMentionSuggestions(false);
      setMentionQuery("");
      setShowEmojiPicker(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return <Image size={16} className="text-blue-400" />;
    if (mimeType.includes("pdf") || mimeType.includes("word") || mimeType.includes("text"))
      return <FileText size={16} className="text-orange-400" />;
    if (mimeType.includes("zip") || mimeType.includes("rar") || mimeType.includes("7z"))
      return <Archive size={16} className="text-yellow-400" />;
    return <File size={16} className="text-gray-400" />;
  };

  const canSend = content.trim() || selectedFiles.length > 0;

  return (
    <div
      ref={dropZoneRef}
      className={`p-4 border-t-2 border-purple-500/30 bg-black/50 backdrop-blur-sm relative transition-all ${
        isDragging ? "bg-purple-900/30 border-purple-400" : ""
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-purple-900/50 backdrop-blur-sm z-20 flex items-center justify-center border-2 border-dashed border-purple-400 rounded-lg m-2 pointer-events-none">
          <div className="text-center">
            <Paperclip size={32} className="mx-auto mb-2 text-purple-300" />
            <p className="text-purple-200 font-medium">Drop files here to attach (max {MAX_FILES})</p>
          </div>
        </div>
      )}

      {/* Mention Suggestions */}
      {showMentionSuggestions && filteredParticipants.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-2 bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
          {filteredParticipants.map((participant) => (
            <button
              key={participant.userId}
              onClick={() => insertMention(participant)}
              className="w-full px-4 py-2 text-left hover:bg-gray-700 transition cursor-pointer flex items-center gap-2"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center text-white text-xs font-medium">
                {(participant.fullname || participant.email)
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </div>
              <div>
                <div className="text-white text-sm">
                  {participant.fullname || participant.email.split("@")[0]}
                </div>
                <div className="text-gray-400 text-xs">{participant.email}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Multiple Files Preview */}
      {selectedFiles.length > 0 && (
        <div className="mb-3 p-3 bg-gray-800/80 border border-gray-700 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-xs">
              {selectedFiles.length} file{selectedFiles.length > 1 ? "s" : ""} selected
              {selectedFiles.length < MAX_FILES && ` (${MAX_FILES - selectedFiles.length} more allowed)`}
            </span>
            <button
              onClick={handleClearAllFiles}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition cursor-pointer"
            >
              <Trash2 size={12} />
              Clear all
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
            {selectedFiles.map((fileItem) => (
              <div
                key={fileItem.id}
                className="relative flex-shrink-0 group"
              >
                {fileItem.previewUrl ? (
                  <img
                    src={fileItem.previewUrl}
                    alt={fileItem.file.name}
                    className="w-16 h-16 object-cover rounded-md border border-gray-600"
                  />
                ) : (
                  <div className="w-16 h-16 bg-gray-700 rounded-md flex flex-col items-center justify-center border border-gray-600">
                    {getFileIcon(fileItem.file.type)}
                    <span className="text-[8px] text-gray-400 mt-1 px-1 truncate max-w-full">
                      {fileItem.file.name.split('.').pop()?.toUpperCase()}
                    </span>
                  </div>
                )}
                {/* Remove button */}
                <button
                  onClick={() => handleRemoveFile(fileItem.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-md cursor-pointer"
                  title="Remove file"
                >
                  <X size={12} />
                </button>
                {/* Filename tooltip */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-[8px] text-white px-1 py-0.5 truncate rounded-b-md opacity-0 group-hover:opacity-100 transition-opacity">
                  {fileItem.file.name}
                </div>
              </div>
            ))}
            {/* Add more button if under limit */}
            {selectedFiles.length < MAX_FILES && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 bg-gray-700/50 hover:bg-gray-700 rounded-md flex flex-col items-center justify-center border border-dashed border-gray-600 hover:border-purple-500 transition cursor-pointer flex-shrink-0"
                title="Add more files"
              >
                <Paperclip size={16} className="text-gray-400" />
                <span className="text-[8px] text-gray-400 mt-1">Add more</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* File Error */}
      {fileError && (
        <div className="mb-3 p-2 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
          {fileError}
        </div>
      )}

      {/* Hidden file input - now with multiple */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileInputChange}
        accept={ALLOWED_MIME_TYPES.join(",")}
        className="hidden"
      />

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <div
          ref={emojiPickerRef}
          className="absolute bottom-full left-4 mb-2 z-30"
        >
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            theme={Theme.DARK}
            width={320}
            height={400}
            searchPlaceHolder="Search emoji..."
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}

      <div className="flex items-center gap-2 md:gap-3">
        {/* File picker button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || selectedFiles.length >= MAX_FILES}
          className="h-10 w-10 md:h-[48px] md:w-[48px] flex items-center justify-center bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 border border-gray-700 relative"
          title={selectedFiles.length >= MAX_FILES ? `Maximum ${MAX_FILES} files reached` : "Attach files"}
        >
          <Paperclip size={18} className="md:w-6 md:h-6" />
          {selectedFiles.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 md:w-5 md:h-5 bg-purple-600 rounded-full text-white text-[10px] md:text-xs flex items-center justify-center">
              {selectedFiles.length}
            </span>
          )}
        </button>

        {/* Emoji picker button */}
        <button
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          disabled={isLoading}
          className={`h-10 w-10 md:h-[48px] md:w-[48px] flex items-center justify-center bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 border border-gray-700 ${
            showEmojiPicker ? "bg-purple-600/20 text-purple-400 border-purple-500" : ""
          }`}
          title="Add emoji"
        >
          <Smile size={18} className="md:w-6 md:h-6" />
        </button>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder={selectedFiles.length > 0 ? "Add a message (optional)..." : "Type a message..."}
          className="flex-1 bg-gray-800/80 border-2 border-gray-600 rounded-lg px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base text-white placeholder-gray-400 resize-none focus:outline-none focus:border-purple-500 focus:bg-gray-800 h-10 md:h-[48px] max-h-32 overflow-y-auto transition-all [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-500/50 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar-corner]:hidden"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(107, 114, 128, 0.3) transparent",
          }}
          rows={1}
        />
        <button
          onClick={handleSend}
          disabled={!canSend || isLoading}
          className="h-10 w-10 md:h-[48px] md:w-[48px] flex items-center justify-center bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 shadow-lg hover:shadow-purple-500/50"
        >
          {isLoading ? (
            <div className="w-3 h-3 md:w-5 md:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Send size={18} className="md:w-6 md:h-6" />
          )}
        </button>
      </div>
    </div>
  );
}
