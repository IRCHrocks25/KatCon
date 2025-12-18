"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Users, UserMinus, UserPlus, Hash, Lock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type {
  Conversation,
  ConversationParticipant,
} from "@/lib/supabase/messaging";
import {
  addChannelParticipant,
  removeChannelParticipant,
  leaveChannel,
  deleteChannel,
} from "@/lib/supabase/messaging";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface ChannelSettingsDialogProps {
  open: boolean;
  conversation: Conversation | null;
  onClose: () => void;
  onParticipantsChanged?: () => void;
}

interface UserOption {
  id: string;
  email: string;
  fullname?: string | null;
}

type ConfirmAction =
  | { type: "remove"; participant: ConversationParticipant }
  | { type: "leave" }
  | { type: "delete" }
  | null;

export function ChannelSettingsDialog({
  open,
  conversation,
  onClose,
  onParticipantsChanged,
}: ChannelSettingsDialogProps) {
  const { user: currentUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [availableUsers, setAvailableUsers] = useState<UserOption[]>([]);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  useEffect(() => {
    if (!open || !conversation) return;

    const fetchUsers = async () => {
      try {
        setIsLoadingUsers(true);
        const { data, error } = await supabase
          .from("profiles")
          .select("id, email, fullname, approved")
          .eq("approved", true);

        if (error) throw error;

        const participantsIds = new Set(
          (conversation.participants || []).map((p) => p.userId)
        );

        setAvailableUsers(
          (data || [])
            .filter(
              (u) =>
                u.id !== currentUser?.id && !participantsIds.has(u.id || "")
            )
            .map((u) => ({
              id: u.id,
              email: u.email || "",
              fullname: u.fullname || null,
            }))
        );
      } catch (error) {
        console.error("Error fetching users for channel settings:", error);
        toast.error("Failed to load users");
      } finally {
        setIsLoadingUsers(false);
      }
    };

    fetchUsers();
  }, [open, conversation, currentUser]);

  if (!open || !conversation) return null;

  const handleAddParticipant = async (userId: string) => {
    try {
      setIsLoading(true);
      await addChannelParticipant(conversation.id, userId);
      toast.success("Participant added");
      onParticipantsChanged?.();

      setAvailableUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (error) {
      console.error("Error adding participant:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to add participant"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveParticipant = async (participant: ConversationParticipant) => {
    try {
      setIsLoading(true);
      await removeChannelParticipant(conversation.id, participant.userId);
      toast.success("Participant removed");
      onParticipantsChanged?.();
    } catch (error) {
      console.error("Error removing participant:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to remove participant"
      );
    } finally {
      setIsLoading(false);
      setConfirmAction(null);
    }
  };

  const handleLeaveChannel = async () => {
    try {
      setIsLoading(true);
      await leaveChannel(conversation.id);
      toast.success("You left the channel");
      onParticipantsChanged?.();
      onClose();
    } catch (error) {
      console.error("Error leaving channel:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to leave channel"
      );
    } finally {
      setIsLoading(false);
      setConfirmAction(null);
    }
  };

  const handleDeleteChannel = async () => {
    try {
      setIsLoading(true);
      await deleteChannel(conversation.id);
      toast.success("Channel deleted");
      onParticipantsChanged?.();
      onClose();
    } catch (error) {
      console.error("Error deleting channel:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to delete channel"
      );
    } finally {
      setIsLoading(false);
      setConfirmAction(null);
    }
  };

  const handleConfirmAction = () => {
    if (!confirmAction) return;
    
    if (confirmAction.type === "remove") {
      handleRemoveParticipant(confirmAction.participant);
    } else if (confirmAction.type === "leave") {
      handleLeaveChannel();
    } else if (confirmAction.type === "delete") {
      handleDeleteChannel();
    }
  };

  const getConfirmModalContent = () => {
    if (!confirmAction) return { title: "", message: "", buttonText: "" };
    
    if (confirmAction.type === "remove") {
      const name = confirmAction.participant.fullname || confirmAction.participant.email.split("@")[0];
      return {
        title: "Remove Member",
        message: `Are you sure you want to remove ${name} from this channel?`,
        buttonText: "Remove",
      };
    } else if (confirmAction.type === "leave") {
      return {
        title: "Leave Channel",
        message: "Are you sure you want to leave this channel? You will stop receiving messages.",
        buttonText: "Leave",
      };
    } else {
      return {
        title: "Delete Channel",
        message: "Are you sure you want to delete this channel? All messages and participants will be permanently removed. This action cannot be undone.",
        buttonText: "Delete",
      };
    }
  };

  const filteredUsers = availableUsers.filter((u) => {
    if (!userSearch.trim()) return true;
    const query = userSearch.toLowerCase();
    return (
      u.email.toLowerCase().includes(query) ||
      (u.fullname || "").toLowerCase().includes(query)
    );
  });

  const isCurrentUserParticipant = conversation.participants.some(
    (p) => p.userId === currentUser?.id
  );

  const isCreator = conversation.createdBy === currentUser?.id;

  const visibilityLabel = conversation.isPrivate ? "Private channel" : "Public channel";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-lg max-h-[90vh] bg-gray-900 border border-gray-800 rounded-xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center">
              {conversation.type === "channel" ? (
                <Hash size={16} className="text-white" />
              ) : (
                <Users size={16} className="text-white" />
              )}
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                {conversation.name || "Unnamed Channel"}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                {conversation.isPrivate ? (
                  <>
                    <Lock size={12} className="text-gray-400" />
                    <span>{visibilityLabel}</span>
                  </>
                ) : (
                  <span className="px-2 py-0.5 rounded-full border border-purple-500/60 text-purple-300">
                    {visibilityLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-800 transition"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Participants */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-gray-400" />
                <h3 className="text-sm font-medium text-white">Members</h3>
              </div>
              <span className="text-xs text-gray-500">
                {conversation.participants.length} member
                {conversation.participants.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="space-y-1 rounded-lg border border-gray-800 bg-gray-900/60 p-2 max-h-60 overflow-y-auto">
              {conversation.participants.map((participant) => {
                const isSelf = participant.userId === currentUser?.id;
                return (
                  <div
                    key={participant.userId}
                    className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-800/60"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center text-[10px] font-medium text-white">
                        {(participant.fullname || participant.email || "?")
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)}
                      </div>
                      <div>
                        <div className="text-xs font-medium text-white">
                          {participant.fullname ||
                            participant.email.split("@")[0]}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {participant.email}
                        </div>
                      </div>
                    </div>
                    {isCreator && !isSelf && (
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => setConfirmAction({ type: "remove", participant })}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-red-300 hover:text-white hover:bg-red-600/70 disabled:opacity-50"
                      >
                        <UserMinus size={12} />
                        Remove
                      </button>
                    )}
                    {isSelf && (
                      <span className="text-[11px] text-gray-400">You</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Add members (creator only) */}
          {isCreator && (
            <section>
              <div className="flex items-center gap-2 mb-2">
                <UserPlus size={16} className="text-gray-400" />
                <h3 className="text-sm font-medium text-white">Add members</h3>
              </div>
              <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900/60 p-2">
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by name or email"
                  className="w-full rounded-md bg-gray-800 border border-gray-700 px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
                {isLoadingUsers ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="w-5 h-5 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <p className="py-2 text-[11px] text-gray-500">
                    No users available to add.
                  </p>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {filteredUsers.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleAddParticipant(user.id)}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-800/70 text-left text-xs disabled:opacity-50"
                      >
                        <div>
                          <div className="text-white font-medium">
                            {user.fullname || user.email.split("@")[0]}
                          </div>
                          <div className="text-[11px] text-gray-400">
                            {user.email}
                          </div>
                        </div>
                        <span className="text-[11px] text-purple-300">
                          Add
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-white"
          >
            Close
          </button>
          <div className="flex items-center gap-2">
            {/* Non-creator participants can leave */}
            {isCurrentUserParticipant && !isCreator && (
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setConfirmAction({ type: "leave" })}
                className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs text-red-300 hover:text-white hover:bg-red-600/70 disabled:opacity-50"
              >
                Leave channel
              </button>
            )}
            {/* Creator can delete */}
            {isCreator && (
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setConfirmAction({ type: "delete" })}
                className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs bg-red-600/80 text-white hover:bg-red-600 disabled:opacity-50"
              >
                Delete channel
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmAction(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-xl p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">
                  {getConfirmModalContent().title}
                </h3>
              </div>
              <p className="text-sm text-gray-300 mb-6">
                {getConfirmModalContent().message}
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm text-gray-300 hover:text-white transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAction}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition disabled:opacity-50 flex items-center gap-2"
                >
                  {isLoading && (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {getConfirmModalContent().buttonText}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


