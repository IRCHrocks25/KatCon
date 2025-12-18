"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { MessagingContainer } from "./MessagingContainer";
import {
  RemindersContainer,
  type Reminder,
} from "@/components/reminders/RemindersContainer";

interface MessagesViewProps {
  reminders: Reminder[];
  setReminders: React.Dispatch<React.SetStateAction<Reminder[]>>;
}

export function MessagesView({ reminders, setReminders }: MessagesViewProps) {
  const [showReminders, setShowReminders] = useState(true);

  const pendingRemindersCount = reminders.filter(
    (r) => r.status === "pending"
  ).length;

  return (
    <div className="w-full h-full flex bg-black relative">
      {/* Main Messaging Area */}
      <div className="flex-1 flex">
        <MessagingContainer />
      </div>

      {/* Reminders Sidebar Toggle Button */}
      <button
        onClick={() => setShowReminders(!showReminders)}
        className="absolute top-4 right-4 z-30 p-2 bg-gray-900/80 backdrop-blur-sm border border-gray-800 rounded-lg hover:border-purple-500/50 transition text-gray-400 hover:text-white"
        title={showReminders ? "Hide reminders" : "Show reminders"}
      >
        {showReminders ? (
          <ChevronRight size={20} />
        ) : (
          <>
            <Calendar size={20} />
            {pendingRemindersCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-purple-600 rounded-full text-white text-xs flex items-center justify-center font-semibold">
                {pendingRemindersCount > 9 ? "9+" : pendingRemindersCount}
              </span>
            )}
          </>
        )}
      </button>

      {/* Reminders Sidebar */}
      <AnimatePresence>
        {showReminders && (
          <motion.div
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="w-80 h-full border-l border-gray-800 bg-gray-900/50 flex flex-col relative z-20"
          >
            {/* Close Button */}
            <button
              onClick={() => setShowReminders(false)}
              className="absolute top-4 left-4 z-10 p-2 bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-lg hover:border-purple-500/50 transition text-gray-400 hover:text-white"
              title="Hide reminders"
            >
              <ChevronRight size={16} />
            </button>

            {/* Reminders Container */}
            <div className="flex-1 overflow-hidden pt-14">
              <RemindersContainer
                reminders={reminders}
                setReminders={setReminders}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


