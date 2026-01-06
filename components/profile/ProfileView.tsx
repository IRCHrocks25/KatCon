"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { updateProfile, invalidateProfileCache } from "@/lib/supabase/profile";
import {
  uploadAvatarViaAPI,
  validateAvatarFile,
} from "@/lib/supabase/avatar-upload";
import { toast } from "sonner";
import { Loader2, Mail, Circle, Lock } from "lucide-react";
import type { Reminder } from "@/lib/supabase/reminders";
import { UserStatusSelector } from "@/components/user/UserStatusSelector";
import { getUserStatus, type UserStatus } from "@/lib/supabase/messaging";

interface ProfileViewProps {
  reminders: Reminder[];
  setReminders: (reminders: Reminder[]) => void;
}

export function ProfileView({ reminders, setReminders }: ProfileViewProps) {
  const { user, refreshProfile, logout } = useAuth();
  const [username, setUsername] = useState(user?.username || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isStatusSelectorOpen, setIsStatusSelectorOpen] = useState(false);
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Update local state when user changes
  useEffect(() => {
    setUsername(user?.username || "");
  }, [user]);

  // Load user status
  useEffect(() => {
    if (user?.id) {
      getUserStatus(user.id)
        .then((status) => setUserStatus(status))
        .catch((error) => {
          console.error("Error loading user status:", error);
        });
    }
  }, [user?.id]);

  // Listen for status updates from other components
  useEffect(() => {
    const handleStatusUpdate = (event: CustomEvent) => {
      if (event.detail.userId === user?.id) {
        setUserStatus(event.detail.status);
      }
    };

    window.addEventListener("userStatusUpdated", handleStatusUpdate as EventListener);
    return () => {
      window.removeEventListener("userStatusUpdated", handleStatusUpdate as EventListener);
    };
  }, [user?.id]);

  const handleSaveProfile = async () => {
    if (!user) return;

    // Check if username changed (fullname cannot be changed)
    const usernameChanged = username !== (user.username || "");

    if (!usernameChanged) {
      toast.info("No changes to save");
      return;
    }

    // Validate username
    if (username.length < 3) {
      toast.error("Username must be at least 3 characters");
      return;
    }
    if (username.length > 30) {
      toast.error("Username must be at most 30 characters");
      return;
    }
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(username)) {
      toast.error(
        "Username can only contain letters, numbers, underscores, and hyphens"
      );
      return;
    }

    try {
      setIsSaving(true);

      const updates: { username: string } = { username };

      const updatedProfile = await updateProfile(user.id, updates);

      if (updatedProfile) {
        // Invalidate cache
        invalidateProfileCache(user.id);

        // Refresh profile from AuthContext
        await refreshProfile();

        toast.success("Profile updated successfully");
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update profile"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileSelect = (file: File) => {
    // Validate file
    const validationError = validateAvatarFile(file);
    if (validationError) {
      toast.error(validationError.message);
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setAvatarPreview(e.target?.result as string);
      setSelectedFile(file);
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmUpload = async () => {
    if (!user || !selectedFile) {
      console.error("[PROFILE] Missing user or file:", {
        user: !!user,
        file: !!selectedFile,
      });
      return;
    }

    console.log("[PROFILE] Starting avatar upload for user:", user.id);
    setIsUploadingAvatar(true);
    try {
      const result = await uploadAvatarViaAPI(user.id, selectedFile);
      console.log("[PROFILE] Upload result:", result);

      // Invalidate cache
      invalidateProfileCache(user.id);

      // Refresh profile from AuthContext to get the new avatar
      console.log("[PROFILE] Refreshing profile...");
      await refreshProfile();
      console.log("[PROFILE] Profile refreshed");

      toast.success("Profile picture updated successfully");

      // Clear preview
      setAvatarPreview(null);
      setSelectedFile(null);
    } catch (error) {
      console.error("[PROFILE] Avatar upload error:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to upload profile picture. Please try again.";
      toast.error(errorMessage);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleCancelUpload = () => {
    setAvatarPreview(null);
    setSelectedFile(null);
  };

  const handleChangePassword = async () => {
    if (!user) return;

    // Client-side validation
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    try {
      setIsChangingPassword(true);

      // Import supabase client
      const { supabase } = await import("@/lib/supabase/client");

      // Update password using Supabase Auth
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        console.error("Error updating password:", error);
        toast.error(
          error.message || "Failed to update password"
        );
        return;
      }

      // Clear form fields
      setNewPassword("");
      setConfirmPassword("");

      toast.success("Password updated successfully", {
        description: "For security, you will be logged out. Please log in with your new password."
      });

      // Force logout after successful password change for security
      setTimeout(() => {
        logout();
      }, 2000);

    } catch (error) {
      console.error("Error changing password:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update password"
      );
    } finally {
      setIsChangingPassword(false);
    }
  };

  const hasChanges = username !== (user?.username || "");

  // Get current date
  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const displayName = user?.fullname || user?.username || "User";

  return (
    <div className="h-full w-full bg-black text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-800 bg-gray-950/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-4">
          {/* Left: Welcome Message */}
          <div>
            <h1 className="text-xl font-bold text-white">
              Welcome, {displayName}
            </h1>
            <p className="text-sm text-gray-400">{currentDate}</p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-gray-900">
        <div className="max-w-6xl mx-auto p-6">
          {/* Top Banner */}
          <div className="h-32 bg-gradient-to-r from-purple-600/20 via-pink-500/20 to-orange-500/20 rounded-t-lg mb-6"></div>

          {/* Profile Summary */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 -mt-24 mb-6">
            <div className="flex flex-col items-center gap-4">
              {/* Centered Avatar */}
              <div className="relative">
                <div className="w-32 h-32 rounded-full flex items-center justify-center flex-shrink-0 relative overflow-hidden border-4 border-gray-800">
                  {avatarPreview || user?.avatarUrl ? (
                    <img
                      src={avatarPreview || user?.avatarUrl || ""}
                      alt={user?.fullname || user?.username || "Avatar"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center text-white font-bold text-2xl">
                      {(user?.fullname || user?.username || user?.email || "?")
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </div>
                  )}
                  {isUploadingAvatar && (
                    <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                  )}
                </div>
                {avatarPreview && (
                  <div className="absolute -bottom-2 -right-2 bg-purple-600 text-white text-xs px-2 py-1 rounded-full">
                    Preview
                  </div>
                )}
              </div>

              {/* Name and Email */}
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white">{displayName}</h2>
                <p className="text-gray-400">{user?.email}</p>
                {/* User Status */}
                {userStatus && (
                  <div className="flex items-center justify-center gap-2 mt-2">
                    {userStatus.statusEmoji && (
                      <span className="text-lg">{userStatus.statusEmoji}</span>
                    )}
                    <span className="text-sm text-gray-300">
                      {userStatus.statusText || "No status"}
                    </span>
                  </div>
                )}
                {/* Set Status Button */}
                <button
                  onClick={() => setIsStatusSelectorOpen(true)}
                  className="mt-2 px-4 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition cursor-pointer flex items-center gap-2 mx-auto"
                >
                  <Circle size={14} />
                  {userStatus ? "Change Status" : "Set Status"}
                </button>
              </div>

              {/* Change Photo / Confirm / Cancel Buttons */}
              {avatarPreview ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleConfirmUpload}
                    disabled={isUploadingAvatar}
                    className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isUploadingAvatar ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      "Confirm Change"
                    )}
                  </button>
                  <button
                    onClick={handleCancelUpload}
                    disabled={isUploadingAvatar}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleFileSelect(file);
                      }
                      e.target.value = "";
                    }}
                    disabled={isUploadingAvatar}
                    className="hidden"
                    id="change-photo-input"
                  />
                  <label
                    htmlFor="change-photo-input"
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    Change Photo
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Profile Details Form */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
            <h3 className="text-xl font-semibold mb-6">Profile Details</h3>
            <div className="grid grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={user?.fullname || ""}
                    disabled
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-gray-400 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Full name cannot be changed
                  </p>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    maxLength={30}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    3-30 characters. Letters, numbers, underscores, and hyphens
                    only.
                  </p>
                </div>
              </div>
            </div>

            {/* Edit Button Below Fields */}
            <div className="flex justify-end mt-6">
              <button
                onClick={handleSaveProfile}
                disabled={!hasChanges || isSaving}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Edit"
                )}
              </button>
            </div>
          </div>

          {/* Email Address Section */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
            <h3 className="text-xl font-semibold mb-4">My Email Address</h3>
            <div className="flex items-center gap-3">
              <Mail size={18} className="text-purple-400" />
              <div>
                <p className="text-white">{user?.email}</p>
                <p className="text-sm text-gray-400">Email cannot be changed</p>
              </div>
            </div>
          </div>

          {/* Change Password Section */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
            <h3 className="text-xl font-semibold mb-6">Change Password</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Minimum 6 characters
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Change Password Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleChangePassword}
                  disabled={isChangingPassword || !newPassword || !confirmPassword}
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isChangingPassword ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Lock size={16} />
                      Change Password
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* User Status Selector Modal */}
      <UserStatusSelector
        isOpen={isStatusSelectorOpen}
        onClose={() => setIsStatusSelectorOpen(false)}
        onStatusChange={(status) => {
          // Update local state immediately
          setUserStatus(status);
        }}
      />
    </div>
  );
}
