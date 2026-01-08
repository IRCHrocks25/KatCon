"use client";

import { useState, useEffect, useRef, useCallback} from "react";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { Message } from "@/lib/supabase/messaging";
import { searchMessages } from "@/lib/supabase/messaging";

interface MessageSearchProps {
  messages: Message[];
  conversationId: string;
  isOpen: boolean;
  onClose: () => void;
  onResultChange: (resultIndex: number, messageId: string, allResultIds: string[]) => void;
  onQueryChange?: (query: string) => void;
  onLoadMessage?: (messageId: string) => Promise<void>;
}

// Debounce hook for search input
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function MessageSearch({
  messages,
  conversationId,
  isOpen,
  onClose,
  onResultChange,
  onQueryChange,
  onLoadMessage,
}: MessageSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentResultIndex, setCurrentResultIndex] = useState(-1);
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(searchQuery, 300); // Debounce search input
  
  // Use refs to access latest values without causing re-renders
  const searchResultsRef = useRef<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  const lastProcessedLengthRef = useRef<number>(0);
  const onResultChangeRef = useRef(onResultChange);
  const onLoadMessageRef = useRef(onLoadMessage);

  // Search in database when query changes
  useEffect(() => {
    if (!debouncedQuery.trim() || !conversationId) {
      setSearchResults([]);
      return;
    }

    const performSearch = async () => {
      setIsSearching(true);
      try {
        const results = await searchMessages(conversationId, debouncedQuery.trim(), 200);
        setSearchResults(results);
      } catch (error) {
        console.error("Error searching messages:", error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedQuery, conversationId]);

  // Reset current index when search results change
  useEffect(() => {
    // Only process if the length actually changed
    if (lastProcessedLengthRef.current === searchResults.length) {
      return;
    }
    
    lastProcessedLengthRef.current = searchResults.length;
    
    // Use setTimeout to defer state updates to avoid setState during render
    setTimeout(() => {
      if (searchResults.length > 0) {
        // Find the nearest/latest match (last message in results, which should be most recent)
        const targetIndex = searchResults.length - 1;
        const targetMessage = searchResults[targetIndex];
        const allResultIds = searchResults.map((m) => m.id);
        
        setCurrentResultIndex(targetIndex);
        
        // Notify parent of target result
        onResultChangeRef.current(targetIndex, targetMessage.id, allResultIds);
        
        // Load target result if not already loaded
        if (onLoadMessageRef.current) {
          const isLoaded = messagesRef.current.some((m) => m.id === targetMessage.id);
          if (!isLoaded) {
            onLoadMessageRef.current(targetMessage.id).catch(console.error);
          } else {
            // If already loaded, trigger scroll by setting activeSearchResultId
            // This is handled by the parent component
          }
        }
      } else {
        setCurrentResultIndex(-1);
        onResultChangeRef.current(-1, "", []);
      }
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchResults.length]); // Only depend on length, not the full array or callbacks

  // Update refs when values change
  useEffect(() => {
    searchResultsRef.current = searchResults;
  }, [searchResults]);
  
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  
  useEffect(() => {
    onResultChangeRef.current = onResultChange;
  }, [onResultChange]);
  
  useEffect(() => {
    onLoadMessageRef.current = onLoadMessage;
  }, [onLoadMessage]);

  // Define navigation functions BEFORE they're used in useEffect
  const navigateToNext = useCallback(() => {
    const results = searchResultsRef.current;
    if (results.length === 0) return;
    
    setCurrentResultIndex((prevIndex) => {
      const nextIndex = (prevIndex + 1) % results.length;
      const targetMessage = results[nextIndex];
      const allResultIds = results.map((m) => m.id);
      
      // Use setTimeout to defer parent state update
      setTimeout(() => {
        onResultChangeRef.current(nextIndex, targetMessage.id, allResultIds);
        
        // Load message if not already loaded
        if (onLoadMessageRef.current) {
          const isLoaded = messagesRef.current.some((m) => m.id === targetMessage.id);
          if (!isLoaded) {
            onLoadMessageRef.current(targetMessage.id).catch(console.error);
          }
        }
      }, 0);
      
      return nextIndex;
    });
  }, []);

  const navigateToPrevious = useCallback(() => {
    const results = searchResultsRef.current;
    if (results.length === 0) return;
    
    setCurrentResultIndex((prevIndex) => {
      const newIndex =
        prevIndex === 0
          ? results.length - 1
          : prevIndex - 1;
      const targetMessage = results[newIndex];
      const allResultIds = results.map((m) => m.id);
      
      // Use setTimeout to defer parent state update
      setTimeout(() => {
        onResultChangeRef.current(newIndex, targetMessage.id, allResultIds);
        
        // Load message if not already loaded
        if (onLoadMessageRef.current) {
          const isLoaded = messagesRef.current.some((m) => m.id === targetMessage.id);
          if (!isLoaded) {
            onLoadMessageRef.current(targetMessage.id).catch(console.error);
          }
        }
      }, 0);
      
      return newIndex;
    });
  }, []);
  
  // Function to scroll to the first/only result
  const scrollToResult = useCallback(() => {
    const results = searchResultsRef.current;
    if (results.length === 0) return;
    
    const targetIndex = 0;
    const targetMessage = results[targetIndex];
    const allResultIds = results.map((m) => m.id);
    
    setCurrentResultIndex(targetIndex);
    
    // Use setTimeout to defer parent state update
    setTimeout(() => {
      onResultChangeRef.current(targetIndex, targetMessage.id, allResultIds);
      
      // Load message if not already loaded
      if (onLoadMessageRef.current) {
        const isLoaded = messagesRef.current.some((m) => m.id === targetMessage.id);
        if (!isLoaded) {
          onLoadMessageRef.current(targetMessage.id).catch(console.error);
        }
      }
    }, 0);
  }, []);

  // Focus input when search opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Small delay to ensure smooth animation
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      // Only handle Enter if search has results
      if (searchResultsRef.current.length === 0) return;

      // Enter for next, Shift+Enter for previous
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) {
          navigateToPrevious();
        } else {
          navigateToNext();
        }
      }

      // Cmd/Ctrl+F to focus search (if not already focused)
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, navigateToNext, navigateToPrevious, onClose]);

  const handleClose = useCallback(() => {
    setSearchQuery("");
    setCurrentResultIndex(0);
    onQueryChange?.("");
    onClose();
  }, [onClose, onQueryChange]);

  // Notify parent of query changes
  useEffect(() => {
    if (onQueryChange) {
      onQueryChange(debouncedQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]); // Only depend on debouncedQuery, not onQueryChange

  if (!isOpen) return null;

  const hasResults = searchResults.length > 0;
  const resultText =
    searchResults.length > 0
      ? `${currentResultIndex + 1} of ${searchResults.length}`
      : "No results";

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm p-3"
    >
      <div className="flex items-center gap-2">
        {/* Search Icon */}
        <Search size={18} className="text-gray-400 flex-shrink-0" />

        {/* Search Input */}
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search messages..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
        />

        {/* Result Count */}
        {debouncedQuery.trim() && (
          <div className="text-sm text-gray-400 flex-shrink-0 min-w-[80px] text-right">
            {isSearching ? (
              <div className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin mx-auto" />
            ) : (
              resultText
            )}
          </div>
        )}

        {/* Scroll to result button - Show if only 1 result */}
        {hasResults && searchResults.length === 1 && (
          <button
            onClick={scrollToResult}
            className="p-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded transition flex-shrink-0"
            title="Scroll to result"
          >
            <ChevronDown size={16} />
          </button>
        )}

        {/* Navigation Buttons - Only show if more than 1 result */}
        {hasResults && searchResults.length > 1 && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={navigateToPrevious}
              className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition"
              title="Previous result (Shift+Enter)"
            >
              <ChevronUp size={16} />
            </button>
            <button
              onClick={navigateToNext}
              className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition"
              title="Next result (Enter)"
            >
              <ChevronDown size={16} />
            </button>
          </div>
        )}

        {/* Close Button */}
        <button
          onClick={handleClose}
          className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition flex-shrink-0"
          title="Close search (Esc)"
        >
          <X size={18} />
        </button>
      </div>

      {/* No Results Message */}
      <AnimatePresence>
        {debouncedQuery.trim() && !hasResults && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 text-sm text-gray-400 text-center"
          >
            No messages found matching &ldquo;{debouncedQuery}&rdquo;
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

