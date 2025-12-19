"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AvatarUpload } from "./AvatarUpload";
import { updateProfile, invalidateProfileCache } from "@/lib/supabase/profile";
import { uploadAvatarViaAPI } from "@/lib/supabase/avatar-upload";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const [username, setUsername] = useState(user?.username || "");
  const [fullname, setFullname] = useState(user?.fullname || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Update local state when user changes
  useEffect(() => {
    setUsername(user?.username || "");
    setFullname(user?.fullname || "");
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user) return;

    // Check if anything changed
    const usernameChanged = username !== (user.username || "");
    const fullnameChanged = fullname !== (user.fullname || "");

    if (!usernameChanged && !fullnameChanged) {
      toast.info("No changes to save");
      return;
    }

    // Validate username if changed
    if (usernameChanged) {
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
    }

    try {
      setIsSaving(true);

      const updates: { username?: string; fullname?: string } = {};
      if (usernameChanged) updates.username = username;
      if (fullnameChanged) updates.fullname = fullname;

      const updatedProfile = await updateProfile(user.id, updates);

      if (updatedProfile) {
        // Update user context
        setUser({
          ...user,
          username: updatedProfile.username,
          fullname: updatedProfile.fullname,
        });

        // Invalidate cache
        invalidateProfileCache(user.id);

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

  const handleAvatarUpload = async (file: File): Promise<{ url: string }> => {
    if (!user) throw new Error("Not authenticated");

    setIsUploadingAvatar(true);
    try {
      const result = await uploadAvatarViaAPI(user.id, file);

      // Update user context
      setUser({
        ...user,
        avatarUrl: result.url,
      });

      // Invalidate cache
      invalidateProfileCache(user.id);

      return result;
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const hasChanges =
    username !== (user?.username || "") ||
    fullname !== (user?.fullname || "");

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Profile Settings</h1>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-8">
          {/* Avatar Section */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Profile Picture</h2>
            <AvatarUpload
              currentAvatarUrl={user?.avatarUrl}
              currentName={user?.fullname || user?.username}
              currentEmail={user?.email}
              onUpload={handleAvatarUpload}
              disabled={isUploadingAvatar}
            />
          </div>

          {/* Profile Information Section */}
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Profile Information</h2>

            {/* Email (read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={user?.email || ""}
                disabled
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-gray-400 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">
                Email cannot be changed
              </p>
            </div>

            {/* Username */}
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
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                3-30 characters. Letters, numbers, underscores, and hyphens
                only.
              </p>
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={fullname}
                onChange={(e) => setFullname(e.target.value)}
                placeholder="Enter your full name"
                maxLength={100}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Your display name (optional)
              </p>
            </div>

            {/* Account Type (read-only) */}
            {user?.accountType && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Account Type
                </label>
                <input
                  type="text"
                  value={user.accountType}
                  disabled
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-gray-400 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Account type cannot be changed
                </p>
              </div>
            )}

            {/* Save Button */}
            <div className="flex items-center justify-end gap-2 pt-4">
              <button
                onClick={handleSaveProfile}
                disabled={!hasChanges || isSaving}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

