"use client";

import { useState } from "react";
import { AIChatInput } from "@/components/ui/ai-chat-input";
import {
  CheckSquare,
  Calendar,
  Users,
  Clock,
  ListTodo,
  MessageSquare,
  AlertCircle,
  LogOut,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { MessageLoading } from "@/components/ui/message-loading";
import { useAuth } from "@/contexts/AuthContext";
import { LoginForm } from "@/components/auth/LoginForm";
import { toast } from "sonner";
import { RemindersContainer } from "@/components/reminders/RemindersContainer";

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
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Add bot response message
        if (data.output) {
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
      icon: ListTodo,
      label: "My Tasks",
      color: "from-blue-500/20 to-cyan-500/20",
    },
    {
      icon: CheckSquare,
      label: "Ongoing Tasks",
      color: "from-purple-500/20 to-pink-500/20",
    },
    {
      icon: Calendar,
      label: "Upcoming Deadlines",
      color: "from-orange-500/20 to-yellow-500/20",
    },
    {
      icon: Users,
      label: "Team Status",
      color: "from-pink-500/20 to-purple-500/20",
    },
    {
      icon: Clock,
      label: "Check Schedule",
      color: "from-blue-500/20 to-purple-500/20",
    },
    {
      icon: AlertCircle,
      label: "Urgent Items",
      color: "from-orange-500/20 to-pink-500/20",
    },
    {
      icon: MessageSquare,
      label: "Team Updates",
      color: "from-purple-500/20 to-blue-500/20",
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
        <RemindersContainer />
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
            />
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap justify-center gap-3 mt-2 mb-4 shrink-0">
            {quickActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <button
                  key={index}
                  className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 text-gray-300 hover:text-white hover:border-gray-700 transition-all duration-200 hover:scale-105 ${action.color} hover:bg-gradient-to-r`}
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
