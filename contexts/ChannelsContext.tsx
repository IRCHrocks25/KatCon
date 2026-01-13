"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getConversations, type Conversation } from "@/lib/supabase/messaging";

interface ChannelsContextType {
  channels: Conversation[];
  isLoading: boolean;
  error: string | null;
  refreshChannels: () => Promise<void>;
}

const ChannelsContext = createContext<ChannelsContextType | undefined>(undefined);

interface ChannelsProviderProps {
  children: ReactNode;
}

export function ChannelsProvider({ children }: ChannelsProviderProps) {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChannels = async () => {
    // Only load if user is authenticated
    if (!user) {
      setChannels([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const conversations = await getConversations();
      // Filter to only show channels (not DMs)
      const channelConversations = conversations.filter(
        (conv) => conv.type === "channel"
      );
      setChannels(channelConversations);
    } catch (err) {
      console.error("Error loading channels:", err);
      setError("Failed to load channels");
    } finally {
      setIsLoading(false);
    }
  };

  const refreshChannels = async () => {
    await loadChannels();
  };

  useEffect(() => {
    // Clear channels when user logs out
    if (!user) {
      setChannels([]);
      setError(null);
      return;
    }
    
    // Load channels when user is available (this will refresh on user change)
    loadChannels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // Only depend on user.id to trigger refresh on user change

  const value: ChannelsContextType = {
    channels,
    isLoading,
    error,
    refreshChannels,
  };

  return (
    <ChannelsContext.Provider value={value}>
      {children}
    </ChannelsContext.Provider>
  );
}

export function useChannels() {
  const context = useContext(ChannelsContext);
  if (context === undefined) {
    throw new Error("useChannels must be used within a ChannelsProvider");
  }
  return context;
}
