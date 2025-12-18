"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase/client";

interface CreateChannelModalProps {
  onClose: () => void;
  onCreate: (
    name: string,
    description: string | null,
    isPrivate: boolean,
    participantIds: string[]
  ) => void;
  onCreateDM?: (userId: string) => void;
}

export function CreateChannelModal({
  onClose,
  onCreate,
  onCreateDM,
}: CreateChannelModalProps) {
  const { user: currentUser } = useAuth();
  const [mode, setMode] = useState<"dm" | "channel">("dm");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<
    Array<{ id: string; email: string; fullname?: string }>
  >([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  // Fetch available users (only approved users)
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data: profiles, error } = await supabase
          .from("profiles")
          .select("id, email, fullname, approved")
          .neq("id", currentUser?.id || "")
          .eq("approved", true)
          .order("fullname", { ascending: true });

        if (error) throw error;

        setAvailableUsers(
          (profiles || []).filter((p) => p.email) as Array<{
            id: string;
            email: string;
            fullname?: string;
          }>
        );
      } catch (error) {
        console.error("Error fetching users:", error);
        toast.error("Failed to load users");
      } finally {
        setIsLoadingUsers(false);
      }
    };

    if (currentUser) {
      fetchUsers();
    }
  }, [currentUser]);

  const handleToggleUser = (userId: string) => {
    if (mode === "dm") {
      // For DM, only allow selecting one user
      setSelectedUserIds([userId]);
    } else {
      // For channel, allow multiple users
      setSelectedUserIds((prev) =>
        prev.includes(userId)
          ? prev.filter((id) => id !== userId)
          : [...prev, userId]
      );
    }
  };

  const handleCreate = () => {
    if (mode === "dm") {
      if (selectedUserIds.length !== 1) {
        toast.error("Please select exactly one person to message");
        return;
      }
      if (onCreateDM) {
        onCreateDM(selectedUserIds[0]);
      }
    } else {
      // Channel mode
      if (!name.trim()) {
        toast.error("Channel name is required");
        return;
      }
      onCreate(
        name.trim(),
        description.trim() || null,
        isPrivate,
        selectedUserIds
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-gray-900 border border-gray-800 rounded-lg w-full max-w-md max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">New Conversation</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-800 rounded transition"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b border-gray-800">
          <button
            onClick={() => setMode("dm")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition ${
              mode === "dm"
                ? "text-white border-b-2 border-purple-500 bg-gray-800/50"
                : "text-gray-400 hover:text-white hover:bg-gray-800/30"
            }`}
          >
            Direct Message
          </button>
          <button
            onClick={() => setMode("channel")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition ${
              mode === "channel"
                ? "text-white border-b-2 border-purple-500 bg-gray-800/50"
                : "text-gray-400 hover:text-white hover:bg-gray-800/30"
            }`}
          >
            Channel
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {mode === "channel" ? (
            <>
              {/* Channel Name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Channel Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. general"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  maxLength={50}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's this channel about?"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
                  rows={3}
                  maxLength={200}
                />
              </div>

              {/* Privacy Toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="private"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="w-4 h-4 text-purple-600 bg-gray-800 border-gray-700 rounded focus:ring-purple-500"
                />
                <label htmlFor="private" className="text-sm text-gray-300">
                  Make private (only invited members can access)
                </label>
              </div>

              {/* Participants for Channel */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Add Members (optional)
                </label>
                {isLoadingUsers ? (
                  <div className="text-center py-4">
                    <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto" />
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto border border-gray-700 rounded-lg p-2 space-y-1">
                    {availableUsers.map((user) => (
                      <label
                        key={user.id}
                        className="flex items-center gap-2 p-2 hover:bg-gray-800 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(user.id)}
                          onChange={() => handleToggleUser(user.id)}
                          className="w-4 h-4 text-purple-600 bg-gray-800 border-gray-700 rounded focus:ring-purple-500"
                        />
                        <div className="flex-1">
                          <div className="text-white text-sm">
                            {user.fullname || user.email.split("@")[0]}
                          </div>
                          <div className="text-gray-400 text-xs">
                            {user.email}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* DM Mode - User Selection (single select) */
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Select a person to message *
              </label>
              {isLoadingUsers ? (
                <div className="text-center py-4">
                  <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto" />
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto border border-gray-700 rounded-lg p-2 space-y-1">
                  {availableUsers.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleToggleUser(user.id)}
                      className={`w-full p-3 rounded text-left transition ${
                        selectedUserIds.includes(user.id)
                          ? "bg-purple-600/20 border-2 border-purple-500"
                          : "border-2 border-transparent hover:bg-gray-800"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                          {(user.fullname || user.email)
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                        </div>
                        <div className="flex-1">
                          <div className="text-white text-sm font-medium">
                            {user.fullname || user.email.split("@")[0]}
                          </div>
                          <div className="text-gray-400 text-xs">
                            {user.email}
                          </div>
                        </div>
                        {selectedUserIds.includes(user.id) && (
                          <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0">
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 12 12"
                              fill="none"
                            >
                              <path
                                d="M2 6L5 9L10 3"
                                stroke="white"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-300 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={
              mode === "dm" ? selectedUserIds.length !== 1 : !name.trim()
            }
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mode === "dm" ? "Start Chat" : "Create Channel"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
