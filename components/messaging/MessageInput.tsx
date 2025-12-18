"use client";

import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import type { ConversationParticipant } from "@/lib/supabase/messaging";

interface MessageInputProps {
  onSend: (content: string) => void;
  isLoading: boolean;
  participants: ConversationParticipant[];
}

export function MessageInput({
  onSend,
  isLoading,
  participants,
}: MessageInputProps) {
  const [content, setContent] = useState("");
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleSend = () => {
    if (content.trim() && !isLoading) {
      onSend(content);
      setContent("");
      setShowMentionSuggestions(false);
      setMentionQuery("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-4 border-t-2 border-purple-500/30 bg-black/50 backdrop-blur-sm relative">
      {/* Mention Suggestions */}
      {showMentionSuggestions && filteredParticipants.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-2 bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
          {filteredParticipants.map((participant) => (
            <button
              key={participant.userId}
              onClick={() => insertMention(participant)}
              className="w-full px-4 py-2 text-left hover:bg-gray-700 transition flex items-center gap-2"
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

      <div className="flex items-center gap-3">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Type a message..."
          className="flex-1 bg-gray-800/80 border-2 border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 resize-none focus:outline-none focus:border-purple-500 focus:bg-gray-800 h-[48px] max-h-32 overflow-y-auto transition-all [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-500/50 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar-corner]:hidden"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(107, 114, 128, 0.3) transparent",
          }}
          rows={1}
          disabled={isLoading}
        />
        <button
          onClick={handleSend}
          disabled={!content.trim() || isLoading}
          className="h-[48px] w-[48px] flex items-center justify-center bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 shadow-lg hover:shadow-purple-500/50"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Send size={22} />
          )}
        </button>
      </div>
    </div>
  );
}
