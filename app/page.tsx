"use client";

import { useState, useEffect } from "react";
import { AIChatInput } from "@/components/ui/ai-chat-input";
import {
  CheckSquare,
  Calendar,
  Users,
  Clock,
  MessageSquare,
  AlertCircle,
  LogOut,
  Bell,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { MessageLoading } from "@/components/ui/message-loading";
import { useAuth } from "@/contexts/AuthContext";
import { LoginForm } from "@/components/auth/LoginForm";
import { toast } from "sonner";
import {
  RemindersContainer,
  type Reminder,
} from "@/components/reminders/RemindersContainer";
import { createReminder } from "@/lib/supabase/reminders";

interface Message {
  id: string;
  text: string;
  timestamp: Date;
  type: "user" | "bot";
}

export default function Home() {
  const { user, loading: authLoading, logout } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [chatInputValue, setChatInputValue] = useState<string | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (globalThis.window) {
      return globalThis.window.localStorage.getItem("chatSessionId");
    }
    return null;
  });

  // Get or generate sessionId
  const getSessionId = (): string => {
    if (sessionId) {
      return sessionId;
    }

    // Generate new UUID
    const newSessionId = crypto.randomUUID();
    setSessionId(newSessionId);
    if (globalThis.window) {
      globalThis.window.localStorage.setItem("chatSessionId", newSessionId);
    }

    return newSessionId;
  };

  // Clear messages, reminders, and sessionId when user changes
  useEffect(() => {
    if (user) {
      // User logged in - clear previous data and create new session
      setMessages([]);
      setReminders([]);
      setChatInputValue(null);
      const newSessionId = crypto.randomUUID();
      setSessionId(newSessionId);
      if (globalThis.window) {
        globalThis.window.localStorage.setItem("chatSessionId", newSessionId);
      }
    } else {
      // User logged out - clear everything
      setMessages([]);
      setReminders([]);
      setChatInputValue(null);
      setSessionId(null);
      if (globalThis.window) {
        globalThis.window.localStorage.removeItem("chatSessionId");
      }
    }
  }, [user]); // Watch user to detect user changes

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) {
      toast.error("Message cannot be empty");
      return;
    }

    const newMessage: Message = {
      id: Date.now().toString(),
      text: text.trim(),
      timestamp: new Date(),
      type: "user",
    };

    // Add message to UI immediately
    setMessages((prev) => [...prev, newMessage]);

    // Get or generate sessionId
    const currentSessionId = getSessionId();

    // Show loading indicator
    setIsLoading(true);

    // Send to webhook via API route
    try {
      const response = await fetch("/api/send-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text.trim(),
          timestamp: newMessage.timestamp.toISOString(),
          sessionId: currentSessionId,
          userEmail: user?.email || null,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        // Check if response is a reminder format
        // New format: { task, datetime, assignees, notes }
        // Legacy format: { output: { task, datetime, notes } }
        let reminderData: {
          task: string;
          datetime: string;
          assignees?: string[];
          notes?: string;
        } | null = null;

        if (data.task && data.datetime) {
          // New format - direct properties
          reminderData = {
            task: data.task,
            datetime: data.datetime,
            assignees: data.assignees,
            notes: data.notes,
          };
        } else if (
          data.output &&
          typeof data.output === "object" &&
          data.output.task &&
          data.output.datetime
        ) {
          // Legacy format - nested in output
          reminderData = {
            task: data.output.task,
            datetime: data.output.datetime,
            assignees: data.output.assignees,
            notes: data.output.notes,
          };
        }

        if (reminderData) {
          // This is a reminder response, save it to Supabase
          try {
            // Parse assignees array - ensure it's an array and filter out invalid emails
            const assignees = Array.isArray(reminderData.assignees)
              ? reminderData.assignees.filter(
                  (email: string) => email && typeof email === "string"
                )
              : [];

            // If no assignees specified, default to current user
            const assignedTo = assignees.length > 0 ? assignees : undefined;

            const reminder = await createReminder({
              title: reminderData.task,
              description: reminderData.notes || undefined,
              dueDate: new Date(reminderData.datetime),
              assignedTo: assignedTo,
            });

            setReminders((prev) => [...prev, reminder]);

            // Show "Reminder set!" as a bot message in chat
            const botMessage: Message = {
              id: `bot-${Date.now()}`,
              text: "Reminder set!",
              timestamp: new Date(),
              type: "bot",
            };
            setMessages((prev) => [...prev, botMessage]);

            // Create success message with assignee info
            let assigneeText: string;
            if (assignedTo && assignedTo.length > 0) {
              assigneeText =
                assignedTo.length === 1
                  ? `assigned to ${assignedTo[0]}`
                  : `assigned to ${assignedTo.length} people`;
            } else {
              assigneeText = "added to your reminders";
            }

            toast.success("Reminder added", {
              description: `"${reminderData.task}" has been ${assigneeText}.`,
            });
          } catch (error) {
            console.error("Error creating reminder from webhook:", error);
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";

            // Show error as bot message in chat
            const errorBotMessage: Message = {
              id: `bot-error-${Date.now()}`,
              text: errorMessage,
              timestamp: new Date(),
              type: "bot",
            };
            setMessages((prev) => [...prev, errorBotMessage]);

            // Also show toast
            toast.error("Failed to save reminder", {
              description: errorMessage,
            });
          }
        } else if (data.output && typeof data.output === "string") {
          // Regular bot response message (output is a string)
          const botMessage: Message = {
            id: `bot-${Date.now()}`,
            text: data.output,
            timestamp: new Date(),
            type: "bot",
          };
          setMessages((prev) => [...prev, botMessage]);
        } else {
          toast.warning("No response from server", {
            description: "The server didn't return a message.",
          });
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.error || errorData.details || "Failed to send message";
        console.error("Failed to send message to webhook:", errorData);
        toast.error("Failed to send message", {
          description: errorMessage,
        });
      }
    } catch (error) {
      console.error("Error sending message to webhook:", error);
      toast.error("Network error", {
        description:
          error instanceof Error
            ? error.message
            : "Failed to connect to server. Please check your connection.",
      });
    } finally {
      setIsLoading(false);
    }
  };
  const quickActions = [
    {
      icon: Bell,
      label: "Reminder",
      color: "from-blue-500/20 to-cyan-500/20",
      message: "Make me a reminder",
    },
    {
      icon: CheckSquare,
      label: "Ongoing Tasks",
      color: "from-purple-500/20 to-pink-500/20",
      message: "Show me my ongoing tasks",
    },
    {
      icon: Calendar,
      label: "Upcoming Deadlines",
      color: "from-orange-500/20 to-yellow-500/20",
      message: "Show me upcoming deadlines",
    },
    {
      icon: Users,
      label: "Team Status",
      color: "from-pink-500/20 to-purple-500/20",
      message: "Show me team status",
    },
    {
      icon: Clock,
      label: "Check Schedule",
      color: "from-blue-500/20 to-purple-500/20",
      message: "Check my schedule",
    },
    {
      icon: AlertCircle,
      label: "Urgent Items",
      color: "from-orange-500/20 to-pink-500/20",
      message: "Show me urgent items",
    },
    {
      icon: MessageSquare,
      label: "Team Updates",
      color: "from-purple-500/20 to-blue-500/20",
      message: "Show me team updates",
    },
  ];

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="relative h-screen w-full overflow-hidden bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Show login form if not authenticated
  if (!user) {
    return <LoginForm />;
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black flex">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-purple-950/40 via-black to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-600/15 via-pink-500/10 via-blue-500/10 to-orange-500/10" />

      {/* Logout Button - Top Right */}
      <button
        onClick={logout}
        className="absolute top-4 right-4 z-20 p-2 text-gray-400 hover:text-white transition flex items-center gap-2 text-sm bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-lg hover:border-gray-700"
        title="Logout"
      >
        <LogOut size={16} />
        <span className="hidden sm:inline">Logout</span>
      </button>

      {/* Reminders Section - 1/3 width (Left) */}
      <div className="relative z-10 w-1/3 h-screen">
        <RemindersContainer reminders={reminders} setReminders={setReminders} />
      </div>

      {/* Chat Section - 2/3 width (Right) */}
      <div className="relative z-10 w-2/3 flex flex-col items-center justify-center px-4 py-4 overflow-hidden">
        <div className="w-full max-w-4xl flex flex-col items-center justify-center space-y-4 py-8">
          {/* Header Section */}
          <div className="text-center space-y-2 shrink-0 mt-8">
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              Katalyst Concierge
            </h1>
            <p className="text-sm md:text-base text-gray-400 font-light">
              Ask me about tasks, deadlines, or team updates — just start typing
              below.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Logged in as: {user.email}
              {user.accountType && (
                <span className="ml-2 text-gray-400">({user.accountType})</span>
              )}
            </p>
          </div>

          {/* Messages Container */}
          {(messages.length > 0 || isLoading) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-3xl mx-auto h-[400px] overflow-y-auto px-2 custom-scrollbar"
            >
              <div className="flex flex-col justify-end min-h-full py-2">
                <AnimatePresence>
                  <div className="space-y-3">
                    {messages.map((message) => (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className={`flex ${
                          message.type === "user"
                            ? "justify-end"
                            : "justify-start"
                        }`}
                      >
                        {message.type === "user" ? (
                          <div className="bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-[80%] shadow-lg">
                            <p className="text-sm font-medium break-words">
                              {message.text}
                            </p>
                            <p className="text-xs text-white/70 mt-1 text-right">
                              {message.timestamp.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        ) : (
                          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 text-gray-300 px-4 py-2.5 rounded-2xl rounded-tl-sm max-w-[80%] shadow-lg">
                            <p className="text-sm font-medium break-words">
                              {message.text}
                            </p>
                            <p className="text-xs text-gray-400 mt-1 text-left">
                              {message.timestamp.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        )}
                      </motion.div>
                    ))}
                    {isLoading && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex justify-start"
                      >
                        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 text-gray-300 px-4 py-3 rounded-2xl rounded-tl-sm max-w-[80%] shadow-lg flex items-center gap-2">
                          <MessageLoading />
                          <span className="text-sm">Thinking...</span>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* Chat Input */}
          <div className="w-full shrink-0">
            <AIChatInput
              onSend={handleSendMessage}
              hasMessages={messages.length > 0}
              setValue={chatInputValue}
            />
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap justify-center gap-3 mt-2 mb-4 shrink-0">
            {quickActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <button
                  key={index}
                  onClick={() => {
                    setChatInputValue(action.message);
                    // Reset after a brief moment to allow the input to update
                    setTimeout(() => setChatInputValue(null), 0);
                  }}
                  className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 text-gray-300 hover:text-white hover:border-gray-700 transition-all duration-200 hover:scale-105 ${action.color} hover:bg-gradient-to-r cursor-pointer`}
                >
                  <Icon
                    size={16}
                    className="opacity-70 group-hover:opacity-100 transition-opacity"
                  />
                  <span className="text-sm font-medium">{action.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
