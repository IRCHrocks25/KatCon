"use client";

import { useState, useEffect, useRef } from "react";
import { AIChatInput } from "@/components/ui/ai-chat-input";
import {
  CheckSquare,
  Calendar,
  Users,
  Clock,
  AlertCircle,
  Bell,
  MessageSquare,
  PanelLeftOpen,
  PanelLeftClose,
  ListTodo,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { MessageLoading } from "@/components/ui/message-loading";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { TasksSummaryWidget } from "@/components/reminders/TasksSummaryWidget";
import { RemindersModal } from "@/components/reminders/RemindersModal";
import { TaskDetailsModal } from "@/components/reminders/TaskDetailsModal";
import { TaskDeleteConfirmationModal } from "@/components/ui/TaskDeleteConfirmationModal";
import type { Reminder } from "@/lib/supabase/reminders";
import { createReminder } from "@/lib/supabase/reminders";
import { robustFetch } from "@/lib/utils/fetch";
import {
  getStorageItem,
  setStorageItem,
  removeStorageItem,
} from "@/lib/utils/storage";

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
  const [selectedTask, setSelectedTask] = useState<Reminder | null>(null);
  const [showTaskDetailsModal, setShowTaskDetailsModal] = useState(false);
  const [previousUserEmail, setPreviousUserEmail] = useState<string | null>(
    null
  );
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const [showTaskWidget, setShowTaskWidget] = useState(true);
  const [isTaskWidgetExpanded, setIsTaskWidgetExpanded] = useState(false);
  const [showTaskDeleteConfirmation, setShowTaskDeleteConfirmation] = useState(false);
  const [deletingTaskFromWidget, setDeletingTaskFromWidget] = useState<Reminder | null>(null);

  // Ref for auto-scrolling to bottom
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Helper functions for user-scoped storage
  const getUserStorageKey = (key: string, userEmail: string) =>
    `${key}_${userEmail}`;
  const getUserActivityKey = (userEmail: string) => `chatActivity_${userEmail}`;

  // Effect 1: Handle user authentication changes (login/logout/different user)
  useEffect(() => {
    const currentUserEmail = user?.email || null;
    console.log("[AI CHAT] Auth change:", currentUserEmail || "null");

    // Clear on logout (user becomes null)
    if (!currentUserEmail && previousUserEmail) {
      console.log("[AI CHAT] Clearing chat on logout");
      setMessages([]);
      // Clear all user-scoped data
      removeStorageItem(getUserStorageKey("chatMessages", previousUserEmail));
      removeStorageItem(getUserStorageKey("chatSessionId", previousUserEmail));
      removeStorageItem(getUserActivityKey(previousUserEmail));
      setSessionId(null);
      setLastActivity(Date.now());
    }

    // Clear when different user logs in
    if (
      currentUserEmail &&
      previousUserEmail &&
      currentUserEmail !== previousUserEmail
    ) {
      console.log("[AI CHAT] Clearing chat for different user");
      setMessages([]);
      // Clear previous user's data
      removeStorageItem(getUserStorageKey("chatMessages", previousUserEmail));
      removeStorageItem(getUserStorageKey("chatSessionId", previousUserEmail));
      removeStorageItem(getUserActivityKey(previousUserEmail));
      setSessionId(null);
      setLastActivity(Date.now());
    }

    setPreviousUserEmail(currentUserEmail);
  }, [user?.email, previousUserEmail]);

  // Effect 2: Load messages when user is available (first time or after auth)
  useEffect(() => {
    if (user?.email && messages.length === 0) {
      console.log("[AI CHAT] Loading chat from storage for user:", user.email);

      // Check if chat data has expired (8 hours)
      const activityKey = getUserActivityKey(user.email);
      const lastActivityStr = getStorageItem(activityKey);
      const lastActivity = lastActivityStr ? parseInt(lastActivityStr, 10) : 0;
      const eightHoursAgo = Date.now() - 8 * 60 * 60 * 1000; // 8 hours in milliseconds

      if (lastActivity < eightHoursAgo) {
        console.log("[AI CHAT] Chat data expired (8+ hours), clearing");
        removeStorageItem(getUserStorageKey("chatMessages", user.email));
        removeStorageItem(getUserStorageKey("chatSessionId", user.email));
        removeStorageItem(activityKey);
        setLastActivity(Date.now());
        return;
      }

      const savedMessages = getStorageItem(
        getUserStorageKey("chatMessages", user.email)
      );
      if (savedMessages) {
        try {
          const parsedMessages = JSON.parse(savedMessages).map(
            (msg: Omit<Message, "timestamp"> & { timestamp: string }) => ({
              ...msg,
              timestamp: new Date(msg.timestamp),
            })
          );
          setMessages(parsedMessages);
          setLastActivity(Date.now());
        } catch (error) {
          console.error("Error loading saved chat messages:", error);
        }
      }
    }
  }, [user?.email, messages.length]);

  // Effect 3: Save messages to localStorage with debouncing
  useEffect(() => {
    if (messages.length > 0 && user?.email) {
      console.log("[AI CHAT] Saving chat to storage for user:", user.email);
      // Debounce saves to avoid excessive localStorage writes
      const timeoutId = setTimeout(() => {
        // Limit conversation history to last 50 messages to prevent storage bloat
        const messagesToSave = messages.slice(-50);
        setStorageItem(
          getUserStorageKey("chatMessages", user.email),
          JSON.stringify(messagesToSave)
        );
        setStorageItem(getUserActivityKey(user.email), Date.now().toString());
        setLastActivity(Date.now());
      }, 500); // 500ms debounce

      return () => clearTimeout(timeoutId);
    }
  }, [messages, user?.email]);

  // Effect 4: Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  // Get or generate sessionId
  const getSessionId = (): string => {
    if (sessionId) {
      return sessionId;
    }

    const newSessionId = crypto.randomUUID();
    setSessionId(newSessionId);
    if (user?.email) {
      setStorageItem(
        getUserStorageKey("chatSessionId", user.email),
        newSessionId
      );
    }

    return newSessionId;
  };

  // Effect 5: Periodically check for expired chat data (every 30 minutes)
  useEffect(() => {
    if (!user?.email) return;

    const checkExpiredData = () => {
      const activityKey = getUserActivityKey(user.email);
      const lastActivityStr = getStorageItem(activityKey);
      const lastActivity = lastActivityStr ? parseInt(lastActivityStr, 10) : 0;
      const eightHoursAgo = Date.now() - 8 * 60 * 60 * 1000; // 8 hours in milliseconds

      if (lastActivity < eightHoursAgo) {
        console.log("[AI CHAT] Auto-cleanup: Chat data expired, clearing");
        setMessages([]);
        removeStorageItem(getUserStorageKey("chatMessages", user.email));
        removeStorageItem(getUserStorageKey("chatSessionId", user.email));
        removeStorageItem(activityKey);
        setSessionId(null);
        setLastActivity(Date.now());
      }
    };

    // Check immediately
    checkExpiredData();

    // Then check every 30 minutes
    const interval = setInterval(checkExpiredData, 30 * 60 * 1000); // 30 minutes

    return () => clearInterval(interval);
  }, [user?.email]);

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
            userId: user?.id || null,
            userEmail: user?.email || null,
            userRole: user?.role || "user",
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
          channelId?: string;
          priority?: string;
        } | null = null;

        if (data.task && data.datetime) {
          reminderData = {
            task: data.task,
            datetime: data.datetime,
            assignees: data.assignees,
            notes: data.notes,
            channelId: data.channelId || data.channel_id,
            priority: data.priority,
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
            channelId: data.output.channelId || data.output.channel_id,
            priority: data.output.priority,
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

            // Validate priority from webhook response
            const validPriorities: readonly string[] = [
              "low",
              "medium",
              "high",
              "urgent",
            ];
            const priority = validPriorities.includes(
              reminderData.priority || ""
            )
              ? (reminderData.priority as "low" | "medium" | "high" | "urgent")
              : "medium";

            const reminder = await createReminder({
              title: reminderData.task,
              description: reminderData.notes,
              dueDate: new Date(reminderData.datetime),
              priority: priority,
              assignedTo: assignedTo,
              channelId: reminderData.channelId,
            });

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

  const handleViewTaskDetails = (reminder: Reminder) => {
    console.log("Task card clicked:", reminder.id);
    setSelectedTask(reminder);
    setShowTaskDetailsModal(true);
  };

  const handleCloseTaskDetailsModal = () => {
    setSelectedTask(null);
    setShowTaskDetailsModal(false);
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-black flex">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-purple-950/40 via-black to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-600/15 via-pink-500/10 via-blue-500/10 to-orange-500/10" />

      {/* Tasks Summary Widget - Desktop/Tablet: Always visible and expanded */}
      <div className="relative z-10 h-full hidden md:block">
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
          onViewTaskDetails={handleViewTaskDetails}
          onExpandedChange={setIsTaskWidgetExpanded}
          onDeleteTask={(reminder) => {
            setDeletingTaskFromWidget(reminder);
            setShowTaskDeleteConfirmation(true);
          }}
          forceExpanded={true}
        />
      </div>

      {/* Mobile Task Widget Toggle */}
      <div className="fixed top-20 left-4 z-20 md:hidden">
        <button
          onClick={() => setShowTaskWidget(!showTaskWidget)}
          className="p-2 bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-lg text-gray-400 hover:text-white transition cursor-pointer"
          title={showTaskWidget ? "Hide tasks" : "Show tasks"}
        >
          <ListTodo size={20} />
        </button>
      </div>

      {/* Mobile Task Widget Overlay */}
      {showTaskWidget && (
        <div className="fixed inset-0 z-30 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowTaskWidget(false)}
          />
          <div className="absolute left-0 top-0 h-full w-80 bg-black">
            <TasksSummaryWidget
              reminders={reminders}
              setReminders={setReminders}
              onOpenModal={() => {
                setShowRemindersModal(true);
                setShowTaskWidget(false);
              }}
              onOpenModalWithForm={() => {
                setShowFormOnOpen(true);
                setShowRemindersModal(true);
                setShowTaskWidget(false);
              }}
              onEditTask={(reminder) => {
                setEditingReminder(reminder);
                setShowRemindersModal(true);
                setShowTaskWidget(false);
              }}
              onViewTaskDetails={(reminder) => {
                handleViewTaskDetails(reminder);
                setShowTaskWidget(false);
              }}
              onDeleteTask={(reminder) => {
                setDeletingTaskFromWidget(reminder);
                setShowTaskDeleteConfirmation(true);
                setShowTaskWidget(false);
              }}
              onCollapse={() => setShowTaskWidget(false)}
              forceExpanded={true}
            />
          </div>
        </div>
      )}

      {/* Chat Section - Flex grow (Right) */}
      <div className="relative z-10 flex-1 flex flex-col px-3 md:px-6 py-3 overflow-hidden">
        <div className="flex flex-col min-h-screen w-full max-w-[700px] md:max-w-[900px] lg:max-w-[1200px] mx-auto">
          {messages.length === 0 ? (
            /* Centered layout when no messages */
            <div className="flex-1 flex flex-col justify-center pb-20">
              {/* Header Section */}
              <div className="text-center space-y-1.5">
                <h1 className="text-[1.25rem] md:text-[2rem] font-bold text-white tracking-tight">
                  Katalyst Concierge
                </h1>
                <p className="text-[13px] text-gray-400 font-light">
                  Ask me about tasks, deadlines, or team updates — just start
                  typing below.
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

              {/* Chat Input and Quick Actions */}
              <div className="shrink-0 space-y-3 mt-8">
                {/* Chat Input */}
                <div className="w-full">
                  <AIChatInput
                    onSend={handleSendMessage}
                    hasMessages={messages.length > 0}
                    setValue={chatInputValue}
                    isLoading={isLoading}
                  />
                </div>

                {/* Quick Action Buttons - Show on all screen sizes when no messages */}
                <div className="flex flex-col gap-3">
                  {/* First row - 4 actions */}
                  <div className="flex flex-wrap justify-center gap-2.5">
                    {quickActions.slice(0, 4).map((action, index) => {
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
                  {/* Second row - 3 actions */}
                  <div className="flex flex-wrap justify-center gap-2.5">
                    {quickActions.slice(4).map((action, index) => {
                      const Icon = action.icon;
                      return (
                        <button
                          key={`second-${index}`}
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
            </div>
          ) : (
            <>
              {/* Messages Container - Takes available space */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="flex-1 overflow-y-auto px-2 custom-scrollbar"
              >
                <div className="flex flex-col justify-end min-h-full py-2 max-w-[600px] mx-auto">
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
                              <p className="text-[13px] font-medium break-words whitespace-pre-wrap">
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
                              <p className="text-[13px] font-medium break-words whitespace-pre-wrap">
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
                  {/* Invisible element for auto-scroll */}
                  <div ref={messagesEndRef} />
                </div>
              </motion.div>

              {/* Bottom Section - Chat Input and Quick Actions */}
              <div className="shrink-0 space-y-3 mt-3">
                {/* Chat Input */}
                <div className="w-full">
                  <AIChatInput
                    onSend={handleSendMessage}
                    hasMessages={messages.length > 0}
                    setValue={chatInputValue}
                    isLoading={isLoading}
                  />
                </div>

                {/* Quick Action Buttons - Hidden when task widget is collapsed or on mobile */}
                {isTaskWidgetExpanded && (
                  <div className="hidden md:flex flex-wrap justify-center gap-2.5">
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
                )}
              </div>
            </>
          )}
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

      {/* Task Details Modal */}
      <TaskDetailsModal
        reminder={selectedTask}
        isOpen={showTaskDetailsModal}
        onClose={handleCloseTaskDetailsModal}
        onEdit={(reminder) => {
          setEditingReminder(reminder);
          setShowRemindersModal(true);
          setShowTaskDetailsModal(false);
        }}
        onDelete={(id) => {
          const reminder = reminders.find((r) => r.id === id);
          if (reminder) {
            // This would trigger the delete handler in RemindersContainer
            // For now, just close the modal
            setShowTaskDetailsModal(false);
          }
        }}
        onToggleComplete={(id) => {
          const reminder = reminders.find((r) => r.id === id);
          if (reminder) {
            // This would trigger the toggle handler
            // For now, just close the modal
            setShowTaskDetailsModal(false);
          }
        }}
      />

      {/* Task Delete Confirmation Modal */}
      <TaskDeleteConfirmationModal
        isOpen={showTaskDeleteConfirmation}
        onClose={() => {
          setShowTaskDeleteConfirmation(false);
          setDeletingTaskFromWidget(null);
        }}
        onConfirm={() => {
          if (deletingTaskFromWidget) {
            // Handle the actual deletion here
            const reminder = deletingTaskFromWidget;
            if (reminder.createdBy === user?.email) {
              // Remove from local state
              setReminders((prev) => prev.filter((r) => r.id !== reminder.id));
              toast.success("Task deleted");
            } else {
              toast.error("Only the creator can delete this task");
            }
            setShowTaskDeleteConfirmation(false);
            setDeletingTaskFromWidget(null);
          }
        }}
        taskTitle={deletingTaskFromWidget?.title}
        isDeleting={false}
      />
    </div>
  );
}
