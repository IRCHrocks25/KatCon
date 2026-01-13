"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getClients, type Client } from "@/lib/supabase/clients";

interface ClientsContextType {
  clients: Client[];
  isLoading: boolean;
  error: string | null;
  refreshClients: () => Promise<void>;
}

const ClientsContext = createContext<ClientsContextType | undefined>(undefined);

interface ClientsProviderProps {
  children: ReactNode;
}

export function ClientsProvider({ children }: ClientsProviderProps) {
  const { user, loading: authLoading } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadClients = async () => {
    // Only load clients if user is authenticated
    if (!user) {
      setClients([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const clientList = await getClients();
      setClients(clientList);
    } catch (err) {
      console.error("Error loading clients:", err);
      setError("Failed to load clients");
    } finally {
      setIsLoading(false);
    }
  };

  const refreshClients = async () => {
    await loadClients();
  };

  useEffect(() => {
    // Only load clients after authentication is complete
    if (!authLoading) {
      loadClients();
    }
  }, [user, authLoading]);

  const value: ClientsContextType = {
    clients,
    isLoading,
    error,
    refreshClients,
  };

  return (
    <ClientsContext.Provider value={value}>
      {children}
    </ClientsContext.Provider>
  );
}

export function useClients() {
  const context = useContext(ClientsContext);
  if (context === undefined) {
    throw new Error("useClients must be used within a ClientsProvider");
  }
  return context;
}