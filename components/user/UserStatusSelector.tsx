"use client";

import { useState, useEffect } from "react";
import { X, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { setUserStatus, getUserStatus, type UserStatus } from "@/lib/supabase/messaging";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface UserStatusSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: (status: UserStatus | null) => void;
}

const PRESET_STATUSES = [
  { emoji: "🟢", text: "Available", expiresIn: null },
  { emoji: "🔴", text: "In meeting", expiresIn: 60 }, // 60 minutes
  { emoji: "🟡", text: "Deep work", expiresIn: 120 }, // 2 hours
  { emoji: "⚫", text: "Offline", expiresIn: null },
  { emoji: "🏖️", text: "On leave", expiresIn: null },
];

export function UserStatusSelector({
  isOpen,
  onClose,
  onStatusChange,
}: UserStatusSelectorProps) {
  const { user } = useAuth();
  const [currentStatus, setCurrentStatus] = useState<UserStatus | null>(null);
  const [customText, setCustomText] = useState("");
  const [customEmoji, setCustomEmoji] = useState("");
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && user?.id) {
      loadStatus();
    }
  }, [isOpen, user?.id]);

  const loadStatus = async () => {
    try {
      const status = await getUserStatus();
      setCurrentStatus(status);
      if (status) {
        setCustomText(status.statusText || "");
        setCustomEmoji(status.statusEmoji || "");
      }
    } catch (error) {
      console.error("Error loading status:", error);
    }
  };

  const handleSetPreset = async (preset: typeof PRESET_STATUSES[0]) => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      const expiresAt = preset.expiresIn
        ? new Date(Date.now() + preset.expiresIn * 60 * 1000).toISOString()
        : null;

      const status = await setUserStatus(preset.text, preset.emoji, expiresAt);
      
      // Update local state
      setCurrentStatus(status);
      
      // Notify parent component
      onStatusChange?.(status);
      
      // Broadcast status update to all components (use setTimeout to ensure state updates first)
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("userStatusUpdated", {
          detail: { userId: user.id, status }
        }));
      }, 0);
      
      toast.success("Status updated");
      onClose();
    } catch (error) {
      console.error("Error setting status:", error);
      toast.error("Failed to set status");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetCustom = async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 60 * 1000).toISOString()
        : null;

      const status = await setUserStatus(
        customText || null,
        customEmoji || null,
        expiresAt
      );
      
      // Update local state
      setCurrentStatus(status);
      
      // Notify parent component
      onStatusChange?.(status);
      
      // Broadcast status update to all components (use setTimeout to ensure state updates first)
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("userStatusUpdated", {
          detail: { userId: user.id, status }
        }));
      }, 0);
      
      toast.success("Status updated");
      onClose();
    } catch (error) {
      console.error("Error setting status:", error);
      toast.error("Failed to set status");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      
      // Update local state
      setCurrentStatus(null);
      
      // Notify parent component
      onStatusChange?.(null);
      
      // Broadcast status update to all components (use setTimeout to ensure state updates first)
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("userStatusUpdated", {
          detail: { userId: user.id, status: null }
        }));
      }, 0);
      
      toast.success("Status cleared");
      onClose();
    } catch (error) {
      console.error("Error clearing status:", error);
      toast.error("Failed to clear status");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl relative z-[10000]"
          >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Set Status</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-800 rounded transition"
            >
              <X size={20} className="text-gray-400" />
            </button>
          </div>

          {/* Current Status */}
          {currentStatus && (
            <div className="mb-4 p-3 bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-400 mb-1">Current Status</p>
              <div className="flex items-center gap-2">
                {currentStatus.statusEmoji && (
                  <span className="text-lg">{currentStatus.statusEmoji}</span>
                )}
                <span className="text-white">
                  {currentStatus.statusText || "No status"}
                </span>
                {currentStatus.expiresAt && (
                  <span className="text-xs text-gray-500">
                    (expires {new Date(currentStatus.expiresAt).toLocaleTimeString()})
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Preset Statuses */}
          <div className="mb-4">
            <p className="text-sm text-gray-400 mb-2">Quick Status</p>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_STATUSES.map((preset) => (
                <button
                  key={preset.text}
                  onClick={() => handleSetPreset(preset)}
                  disabled={isLoading}
                  className="flex items-center gap-2 p-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition text-left disabled:opacity-50"
                >
                  <span className="text-xl">{preset.emoji}</span>
                  <span className="text-white text-sm">{preset.text}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Status */}
          <div className="mb-4">
            <p className="text-sm text-gray-400 mb-2">Custom Status</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customEmoji}
                  onChange={(e) => setCustomEmoji(e.target.value)}
                  placeholder="Emoji (optional)"
                  className="w-1/2 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  maxLength={2}
                />
                <input
                  type="text"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder="Status text"
                  className="w-1/2 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  maxLength={50}
                />
              </div>
              <div className="relative">
                <select
                  value={expiresIn || ""}
                  onChange={(e) =>
                    setExpiresIn(e.target.value ? parseInt(e.target.value) : null)
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 pl-9 text-white focus:outline-none focus:border-purple-500 appearance-none"
                >
                  <option value="">No expiration</option>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="120">2 hours</option>
                  <option value="240">4 hours</option>
                  <option value="480">8 hours</option>
                </select>
                <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              <button
                onClick={handleSetCustom}
                disabled={isLoading || (!customText && !customEmoji)}
                className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Set Custom Status
              </button>
            </div>
          </div>

          {/* Clear Status */}
          {currentStatus && (
            <button
              onClick={handleClear}
              disabled={isLoading}
              className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition disabled:opacity-50"
            >
              Clear Status
            </button>
          )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

