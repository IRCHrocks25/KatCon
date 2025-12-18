"use client";

import { useState } from "react";
import { AIChatInput } from "@/components/ui/ai-chat-input";
import {
  CheckSquare,
  Calendar,
  Users,
  Clock,
  AlertCircle,
  Bell,
  MessageSquare,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { MessageLoading } from "@/components/ui/message-loading";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { TasksSummaryWidget } from "@/components/reminders/TasksSummaryWidget";
import { RemindersModal } from "@/components/reminders/RemindersModal";
import type { Reminder } from "@/lib/supabase/reminders";
import { robustFetch } from "@/lib/utils/fetch";
import { getStorageItem, setStorageItem } from "@/lib/utils/storage";

interface Message {
  id: string;
  text: string;
  timestamp: Date;
  type: "user" | "bot";
}

interface AIChatViewProps {
  reminders: Reminder[];
  setReminders: React.Dispatch<React.SetStateAction<Reminder[]>>;
}

export function AIChatView({ reminders, setReminders }: AIChatViewProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [chatInputValue, setChatInputValue] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    return getStorageItem("chatSessionId");
  });
  const [showRemindersModal, setShowRemindersModal] = useState(false);
  const [showFormOnOpen, setShowFormOnOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);

  // Get or generate sessionId
  const getSessionId = (): string => {
    if (sessionId) {
      return sessionId;
    }

    const newSessionId = crypto.randomUUID();
    setSessionId(newSessionId);
    setStorageItem("chatSessionId", newSessionId);

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

    setMessages((prev) => [...prev, newMessage]);

    const currentSessionId = getSessionId();
    setIsLoading(true);

    try {
      const response = await robustFetch(
        "https://katalyst-crm.fly.dev/webhook/send-message",
        {
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
          retries: 3,
          timeout: 45000,
          forceCloseConnection: false,
        }
      );

      if (response.ok) {
        const data = await response.json();

        let reminderData: {
          task: string;
          datetime: string;
          assignees?: string[];
          notes?: string;
        } | null = null;

        if (data.task && data.datetime) {
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
          reminderData = {
            task: data.output.task,
            datetime: data.output.datetime,
            assignees: data.output.assignees,
            notes: data.output.notes,
          };
        }

        if (reminderData) {
          try {
            const assignees = Array.isArray(reminderData.assignees)
              ? reminderData.assignees.filter(
                  (email: string) => email && typeof email === "string"
                )
              : [];

            const assignedTo = assignees.length > 0 ? assignees : undefined;

            const response = await robustFetch("/api/reminders/create", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                title: reminderData.task,
                description: reminderData.notes || undefined,
                dueDate: new Date(reminderData.datetime).toISOString(),
                assignedTo: assignedTo,
                userEmail: user?.email || null,
              }),
              retries: 0,
              timeout: 30000,
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(
                errorData.error ||
                  errorData.details ||
                  "Failed to create reminder"
              );
            }

            const reminder = await response.json();

            setReminders((prev) => {
              const updated = [...prev, reminder];
              return updated.sort((a, b) => {
                if (a.dueDate && b.dueDate) {
                  const dateDiff =
                    new Date(a.dueDate).getTime() -
                    new Date(b.dueDate).getTime();
                  if (dateDiff !== 0) return dateDiff;
                }
                if (a.dueDate && !b.dueDate) return -1;
                if (!a.dueDate && b.dueDate) return 1;
                const aCreated =
                  "createdAt" in a && typeof a.createdAt === "string"
                    ? new Date(a.createdAt).getTime()
                    : 0;
                const bCreated =
                  "createdAt" in b && typeof b.createdAt === "string"
                    ? new Date(b.createdAt).getTime()
                    : 0;
                if (aCreated && bCreated) {
                  return bCreated - aCreated;
                }
                return 0;
              });
            });

            const botMessage: Message = {
              id: `bot-${Date.now()}`,
              text: "Reminder set!",
              timestamp: new Date(),
              type: "bot",
            };
            setMessages((prev) => [...prev, botMessage]);

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

            const errorBotMessage: Message = {
              id: `bot-error-${Date.now()}`,
              text: errorMessage,
              timestamp: new Date(),
              type: "bot",
            };
            setMessages((prev) => [...prev, errorBotMessage]);

            toast.error("Failed to save reminder", {
              description: errorMessage,
            });
          }
        } else if (data.output && typeof data.output === "string") {
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

  return (
    <div className="relative h-full w-full overflow-hidden bg-black flex">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-purple-950/40 via-black to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-600/15 via-pink-500/10 via-blue-500/10 to-orange-500/10" />

      {/* Tasks Summary Widget - Collapsible (Left) */}
      <div className="relative z-10 h-full">
        <TasksSummaryWidget
          reminders={reminders}
          setReminders={setReminders}
          onOpenModal={() => setShowRemindersModal(true)}
          onOpenModalWithForm={() => {
            setShowFormOnOpen(true);
            setShowRemindersModal(true);
          }}
          onEditTask={(reminder) => {
            setEditingReminder(reminder);
            setShowRemindersModal(true);
          }}
        />
      </div>

      {/* Chat Section - Flex grow (Right) */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-3 py-3 overflow-hidden">
        <div className="w-full max-w-[700px] flex flex-col items-center justify-center space-y-3.5 py-5">
          {/* Header Section */}
          <div className="text-center space-y-1.5 shrink-0 mt-5">
            <h1 className="text-[1.65rem] md:text-[2rem] font-bold text-white tracking-tight">
              Katalyst Concierge
            </h1>
            <p className="text-[13px] text-gray-400 font-light">
              Ask me about tasks, deadlines, or team updates — just start typing
              below.
            </p>
            <p className="text-[11px] text-gray-500 mt-1">
              Logged in as: {user?.fullname || user?.email}
              {user?.accountType && (
                <span className="ml-1.5 text-gray-400">
                  ({user.accountType})
                </span>
              )}
            </p>
          </div>

          {/* Messages Container */}
          {(messages.length > 0 || isLoading) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-[600px] mx-auto h-[320px] overflow-y-auto px-2 custom-scrollbar"
            >
              <div className="flex flex-col justify-end min-h-full py-2">
                <AnimatePresence>
                  <div className="space-y-2.5">
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
                          <div className="bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500 text-white px-3.5 py-2 rounded-xl rounded-tr-sm max-w-[80%] shadow-lg">
                            <p className="text-[13px] font-medium break-words">
                              {message.text}
                            </p>
                            <p className="text-[10px] text-white/70 mt-0.5 text-right">
                              {message.timestamp.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        ) : (
                          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 text-gray-300 px-3.5 py-2 rounded-xl rounded-tl-sm max-w-[80%] shadow-lg">
                            <p className="text-[13px] font-medium break-words">
                              {message.text}
                            </p>
                            <p className="text-[10px] text-gray-400 mt-0.5 text-left">
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
                        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 text-gray-300 px-3.5 py-2.5 rounded-xl rounded-tl-sm max-w-[80%] shadow-lg flex items-center gap-2">
                          <MessageLoading />
                          <span className="text-[13px]">Thinking...</span>
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
              isLoading={isLoading}
            />
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap justify-center gap-2.5 mt-2 mb-3 shrink-0">
            {quickActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <button
                  key={index}
                  onClick={() => {
                    setChatInputValue(action.message);
                    setTimeout(() => setChatInputValue(null), 0);
                  }}
                  className={`group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 text-gray-300 hover:text-white hover:border-gray-700 transition-all duration-200 hover:scale-105 ${action.color} hover:bg-gradient-to-r cursor-pointer`}
                >
                  <Icon
                    size={15}
                    className="opacity-70 group-hover:opacity-100 transition-opacity"
                  />
                  <span className="text-[13px] font-medium">
                    {action.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Reminders Modal - Same modal as Messages tab */}
      <RemindersModal
        isOpen={showRemindersModal}
        onClose={() => {
          setShowRemindersModal(false);
          setShowFormOnOpen(false);
          setEditingReminder(null);
        }}
        reminders={reminders}
        setReminders={setReminders}
        initialShowForm={showFormOnOpen}
        initialEditingReminder={editingReminder}
      />
    </div>
  );
}
