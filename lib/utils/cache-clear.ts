/**
 * Comprehensive cache clearing utility
 * Clears all user-specific data from storage and state
 */

import { removeStorageItem, getLocalStorage } from "./storage";

/**
 * Clear all user-specific cache from localStorage
 * This includes:
 * - Chat session IDs
 * - Active tabs
 * - User-scoped storage keys
 * - Any other user-specific data
 */
export function clearUserCache(): void {
  const storage = getLocalStorage();
  if (!storage) return;

  try {
    console.log("[CACHE] clearUserCache called");
    // List of known user-specific keys to remove
    const keysToRemove = [
      "chatSessionId",
      "activeTab",
      "tasks_widget_reminders",
      "tasks_widget_timestamp",
      "tasks_widget_user_id",
      "tasks_widget_sort",
      // Add any other user-specific keys here
    ];

    // Remove known keys
    keysToRemove.forEach((key) => {
      if (storage.getItem(key)) {
        console.log(`[CACHE] Removing key: ${key}`);
        removeStorageItem(key);
      }
    });

    // Remove all user-scoped chat storage keys
    // Pattern: chatMessages_<email>, chatSessionId_<email>, chatActivity_<email>
    const allKeys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key) {
        allKeys.push(key);
      }
    }

    // Remove keys that match user-scoped patterns
    allKeys.forEach((key) => {
      if (
        key.startsWith("chatMessages_") ||
        key.startsWith("chatSessionId_") ||
        key.startsWith("chatActivity_") ||
        key.includes("_user_") ||
        key.includes("_email_")
      ) {
        removeStorageItem(key);
      }
    });

    console.log("[CACHE] Cleared user-specific cache");
  } catch (error) {
    console.error("[CACHE] Error clearing user cache:", error);
  }
}

/**
 * Clear all application cache (use with caution)
 * This will clear ALL localStorage data including non-user-specific data
 */
export function clearAllCache(): void {
  const storage = getLocalStorage();
  if (!storage) return;

  try {
    // Only clear application-specific keys, preserve Supabase keys for now
    // (Supabase signOut already handles those)
    const allKeys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && !key.startsWith("sb-")) {
        // Don't clear Supabase keys here - signOut handles that
        allKeys.push(key);
      }
    }

    allKeys.forEach((key) => {
      removeStorageItem(key);
    });

    console.log("[CACHE] Cleared all application cache");
  } catch (error) {
    console.error("[CACHE] Error clearing all cache:", error);
  }
}
