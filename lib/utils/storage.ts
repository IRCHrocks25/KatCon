// Centralized storage utility for safe localStorage access
// Works consistently across client, server, edge, and serverless environments

/**
 * Safely get localStorage instance
 * Returns null if not available (SSR, edge runtime, etc.)
 */
export function getLocalStorage(): Storage | null {
  try {
    if (typeof globalThis !== "undefined" && globalThis.window?.localStorage) {
      return globalThis.window.localStorage;
    }
    return null;
  } catch {
    // In some edge cases, accessing localStorage throws
    return null;
  }
}

/**
 * Safely get item from localStorage
 */
export function getStorageItem(key: string): string | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Safely set item in localStorage
 */
export function setStorageItem(key: string, value: string): boolean {
  const storage = getLocalStorage();
  if (!storage) return false;
  
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely remove item from localStorage
 */
export function removeStorageItem(key: string): boolean {
  const storage = getLocalStorage();
  if (!storage) return false;
  
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely clear all localStorage
 */
export function clearStorage(): boolean {
  const storage = getLocalStorage();
  if (!storage) return false;
  
  try {
    storage.clear();
    return true;
  } catch {
    return false;
  }
}

