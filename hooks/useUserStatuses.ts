"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getUserStatuses, type UserStatus } from "@/lib/supabase/messaging";

/**
 * Custom hook for efficiently fetching and caching user statuses
 * Implements batch fetching, caching, and automatic cache invalidation
 */
export function useUserStatuses(userIds: string[]) {
  const [statuses, setStatuses] = useState<Record<string, UserStatus>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  // Cache to avoid refetching recently fetched statuses
  const cacheRef = useRef<Record<string, { status: UserStatus | null; timestamp: number }>>({});
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  
  // Track which user IDs we've already fetched
  const fetchedIdsRef = useRef<Set<string>>(new Set());
  
  const fetchStatuses = useCallback(async (idsToFetch: string[]) => {
    if (idsToFetch.length === 0) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const statusesData = await getUserStatuses(idsToFetch);
      
      // Update cache
      const now = Date.now();
      Object.entries(statusesData).forEach(([userId, status]) => {
        cacheRef.current[userId] = {
          status,
          timestamp: now,
        };
        fetchedIdsRef.current.add(userId);
      });
      
      // Also cache null for users without status
      idsToFetch.forEach((userId) => {
        if (!statusesData[userId] && !cacheRef.current[userId]) {
          cacheRef.current[userId] = {
            status: null,
            timestamp: now,
          };
          fetchedIdsRef.current.add(userId);
        }
      });
      
      setStatuses((prev) => ({
        ...prev,
        ...statusesData,
      }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to fetch user statuses");
      setError(error);
      console.error("Error fetching user statuses:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  useEffect(() => {
    if (userIds.length === 0) return;
    
    const now = Date.now();
    const idsToFetch: string[] = [];
    
    // Determine which IDs need to be fetched
    userIds.forEach((userId) => {
      const cached = cacheRef.current[userId];
      
      // Fetch if:
      // 1. Not in cache
      // 2. Cache expired
      // 3. Never fetched before
      if (
        !cached ||
        now - cached.timestamp > CACHE_DURATION ||
        !fetchedIdsRef.current.has(userId)
      ) {
        idsToFetch.push(userId);
      } else if (cached.status) {
        // Use cached status immediately
        setStatuses((prev) => ({
          ...prev,
          [userId]: cached.status!,
        }));
      }
    });
    
    // Batch fetch missing statuses
    if (idsToFetch.length > 0) {
      fetchStatuses(idsToFetch);
    }
  }, [userIds, fetchStatuses]);

  // Listen for status updates and invalidate cache
  useEffect(() => {
    const handleStatusUpdate = (event: CustomEvent) => {
      const { userId, status } = event.detail;
      
      // Invalidate cache for this user
      delete cacheRef.current[userId];
      fetchedIdsRef.current.delete(userId);
      
      // Update status immediately
      if (status === null) {
        setStatuses((prev) => {
          const updated = { ...prev };
          delete updated[userId];
          return updated;
        });
      } else {
        setStatuses((prev) => ({
          ...prev,
          [userId]: status,
        }));
        // Update cache
        cacheRef.current[userId] = {
          status,
          timestamp: Date.now(),
        };
      }
    };

    window.addEventListener("userStatusUpdated", handleStatusUpdate as EventListener);
    return () => {
      window.removeEventListener("userStatusUpdated", handleStatusUpdate as EventListener);
    };
  }, []);

  // Periodic refresh for other users' statuses (every 30 seconds)
  // This ensures we see status updates from other users
  useEffect(() => {
    if (userIds.length === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const idsToRefresh: string[] = [];
      
      // Find statuses that are older than 30 seconds
      userIds.forEach((userId) => {
        const cached = cacheRef.current[userId];
        if (cached && now - cached.timestamp > 30000) {
          idsToRefresh.push(userId);
        }
      });
      
      if (idsToRefresh.length > 0) {
        fetchStatuses(idsToRefresh);
      }
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [userIds, fetchStatuses]);
  
  // Function to invalidate cache for specific users
  const invalidateStatus = useCallback((userId: string) => {
    delete cacheRef.current[userId];
    fetchedIdsRef.current.delete(userId);
    setStatuses((prev) => {
      const updated = { ...prev };
      delete updated[userId];
      return updated;
    });
  }, []);
  
  // Function to update status for a specific user (optimistic update)
  const updateStatus = useCallback((userId: string, status: UserStatus | null) => {
    const now = Date.now();
    cacheRef.current[userId] = {
      status,
      timestamp: now,
    };
    setStatuses((prev) => {
      if (status === null) {
        const updated = { ...prev };
        delete updated[userId];
        return updated;
      }
      return {
        ...prev,
        [userId]: status,
      };
    });
  }, []);
  
  return {
    statuses,
    isLoading,
    error,
    getStatus: useCallback((userId: string) => statuses[userId] || null, [statuses]),
    invalidateStatus,
    updateStatus,
    refetch: useCallback(() => {
      fetchedIdsRef.current.clear();
      fetchStatuses(userIds);
    }, [userIds, fetchStatuses]),
  };
}

