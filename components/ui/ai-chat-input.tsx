"use client";

import * as React from "react";

import { useState, useEffect, useRef, startTransition } from "react";

import { Send } from "lucide-react";

import { AnimatePresence, motion, Variants } from "motion/react";

const PLACEHOLDERS = [
  "Make me a reminder at 9pm",
  "Create a new contact for John Smith",
  "Update the deal status to closed-won",
  "Schedule a meeting with the sales team",
  "Show me all open opportunities this month",
  "Add a note to the Acme Corp account",
  "Create a task to follow up with leads",
  "Generate a sales report for Q4",
  "Update contact email for Jane Doe",
  "Find all contacts in the tech industry",
  "Set a reminder to call the client tomorrow",
  "Create a new opportunity for $50k",
  "Show me overdue tasks",
  "Update the account owner to Sarah Johnson",
  "Add a new lead from the website",
];

interface AIChatInputProps {
  onSend?: (message: string) => void;
  hasMessages?: boolean;
  setValue?: string | null;
  isLoading?: boolean;
}

const AIChatInput = ({
  onSend,
  hasMessages = false,
  setValue,
  isLoading = false,
}: AIChatInputProps) => {
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  const [showPlaceholder, setShowPlaceholder] = useState(true);

  // Use internal state, but sync it when setValue prop changes
  const [internalValue, setInternalValue] = useState("");
  const previousSetValueRef = useRef<string | null | undefined>(undefined);

  // Update internal value when setValue prop changes to a new non-null value
  useEffect(() => {
    if (
      setValue !== undefined &&
      setValue !== null &&
      setValue !== previousSetValueRef.current
    ) {
      previousSetValueRef.current = setValue;
      startTransition(() => {
        setInternalValue(setValue);
      });
    } else if (setValue === null) {
      previousSetValueRef.current = null;
    }
  }, [setValue]);

  const inputValue = internalValue;
  const setInputValue = setInternalValue;

  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleSend = () => {
    if (inputValue.trim() && onSend) {
      onSend(inputValue);
      setInputValue("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Cycle placeholder text when input is inactive (only if no messages exist)
  useEffect(() => {
    if (inputValue || hasMessages) return;

    const interval = setInterval(() => {
      setShowPlaceholder(false);

      setTimeout(() => {
        setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);

        setShowPlaceholder(true);
      }, 400);
    }, 3000);

    return () => clearInterval(interval);
  }, [inputValue, hasMessages]);

  const containerVariants = {
    collapsed: {
      height: 66,

      boxShadow: "0 2px 8px 0 rgba(0,0,0,0.08)",

      transition: { type: "spring" as const, stiffness: 120, damping: 18 },
    },

    expanded: {
      height: 120,

      boxShadow: "0 8px 32px 0 rgba(0,0,0,0.16)",

      transition: { type: "spring" as const, stiffness: 120, damping: 18 },
    },
  };

  const placeholderContainerVariants = {
    initial: {},

    animate: { transition: { staggerChildren: 0.025 } },

    exit: { transition: { staggerChildren: 0.015, staggerDirection: -1 } },
  };

  const letterVariants = {
    initial: {
      opacity: 0,

      filter: "blur(12px)",

      y: 10,
    },

    animate: {
      opacity: 1,

      filter: "blur(0px)",

      y: 0,

      transition: {
        opacity: { duration: 0.25 },

        filter: { duration: 0.4 },

        y: { type: "spring" as const, stiffness: 80, damping: 20 },
      },
    },

    exit: {
      opacity: 0,

      filter: "blur(12px)",

      y: -10,

      transition: {
        opacity: { duration: 0.2 },

        filter: { duration: 0.3 },

        y: { type: "spring" as const, stiffness: 80, damping: 20 },
      },
    },
  };

  return (
    <div className="w-full flex justify-center items-center">
      <motion.div
        ref={wrapperRef}
        className="w-full max-w-3xl"
        variants={containerVariants as Variants}
        animate="collapsed"
        initial="collapsed"
        style={{
          overflow: "hidden",
          borderRadius: 16,
          background: "rgba(17, 24, 39, 0.8)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(75, 85, 99, 0.3)",
          boxShadow: "0 2px 8px 0 rgba(0, 0, 0, 0.3)",
        }}
      >
        <div className="flex flex-col items-stretch w-full h-full">
          {/* Input Row */}

          <div className="flex items-center gap-2 px-6 py-3 rounded-xl max-w-3xl w-full">
            {/* Text Input & Placeholder */}

            <div className="relative flex-1">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                className="flex-1 border-0 outline-0 rounded-md py-2 text-base bg-transparent w-full font-normal text-white placeholder:text-gray-500"
                style={{ position: "relative", zIndex: 1 }}
              />

              <div className="absolute left-0 top-0 w-full h-full pointer-events-none flex items-center px-6 py-2">
                <AnimatePresence mode="wait">
                  {showPlaceholder && !inputValue && (
                    <motion.span
                      key={placeholderIndex}
                      className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-500 select-none pointer-events-none text-base"
                      style={{
                        whiteSpace: "nowrap",

                        overflow: "hidden",

                        textOverflow: "ellipsis",

                        zIndex: 0,
                      }}
                      variants={placeholderContainerVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                    >
                      {(hasMessages
                        ? "type your message"
                        : PLACEHOLDERS[placeholderIndex]
                      )

                        .split("")

                        .map((char, i) => (
                          <motion.span
                            key={i}
                            variants={letterVariants}
                            style={{ display: "inline-block" }}
                          >
                            {char === " " ? "\u00A0" : char}
                          </motion.span>
                        ))}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <button
              className="flex items-center gap-1 bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500 hover:from-purple-500 hover:via-pink-400 hover:to-orange-400 text-white p-2.5 rounded-full font-medium justify-center transition-all shadow-lg shadow-purple-500/30 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              title="Send"
              type="button"
              onClick={handleSend}
              disabled={isLoading || !inputValue.trim()}
              tabIndex={-1}
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export { AIChatInput };
