"use client";

import { MessagingContainer } from "./MessagingContainer";
import type { Reminder } from "@/lib/supabase/reminders";

interface MessagesViewProps {
  reminders: Reminder[];
  setReminders: React.Dispatch<React.SetStateAction<Reminder[]>>;
}

function MessagesView({ reminders, setReminders }: MessagesViewProps) {
  return (
    <div className="w-full h-full flex bg-black">
      {/* Main Messaging Area with integrated reminders modal */}
      <MessagingContainer reminders={reminders} setReminders={setReminders} />
    </div>
  );
}

export default MessagesView;
