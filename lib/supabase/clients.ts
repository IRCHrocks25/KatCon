import { supabase } from "./client";
import { getUserEmail } from "./session";

export interface Client {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Database client format (matches Supabase schema)
interface DatabaseClient {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Convert database client to app client format
function dbToAppClient(dbClient: DatabaseClient): Client {
  return {
    id: dbClient.id,
    name: dbClient.name,
    company: dbClient.company || undefined,
    email: dbClient.email || undefined,
    phone: dbClient.phone || undefined,
    address: dbClient.address || undefined,
    notes: dbClient.notes || undefined,
    createdBy: dbClient.created_by,
    createdAt: new Date(dbClient.created_at),
    updatedAt: new Date(dbClient.updated_at),
  };
}

/**
 * Get all clients (all authenticated users can read all clients)
 */
export async function getClients(): Promise<Client[]> {
  const { data: clients, error } = await supabase
    .from("clients")
    .select("*")
    .order("name");

  if (error) {
    console.error("Error fetching clients:", error);
    return [];
  }

  return (clients || []).map(dbToAppClient);
}

/**
 * Create a new client
 */
export async function createClient(
  client: Omit<Client, "id" | "createdBy" | "createdAt" | "updatedAt">
): Promise<Client> {
  const userEmail = await getUserEmail();
  if (!userEmail) {
    throw new Error("User not authenticated");
  }

  const { data: clientData, error } = await supabase
    .from("clients")
    .insert({
      name: client.name,
      company: client.company || null,
      email: client.email || null,
      phone: client.phone || null,
      address: client.address || null,
      notes: client.notes || null,
      created_by: userEmail,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create client: ${error.message}`);
  }

  return dbToAppClient(clientData);
}

/**
 * Update a client
 */
export async function updateClient(
  id: string,
  client: Partial<Omit<Client, "id" | "createdBy" | "createdAt" | "updatedAt">>
): Promise<Client> {
  const userEmail = await getUserEmail();
  if (!userEmail) {
    throw new Error("User not authenticated");
  }

  const { data: clientData, error } = await supabase
    .from("clients")
    .update({
      name: client.name,
      company: client.company || null,
      email: client.email || null,
      phone: client.phone || null,
      address: client.address || null,
      notes: client.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("created_by", userEmail) // Only creator can update
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update client: ${error.message}`);
  }

  return dbToAppClient(clientData);
}

/**
 * Delete a client
 */
export async function deleteClient(id: string): Promise<void> {
  const userEmail = await getUserEmail();
  if (!userEmail) {
    throw new Error("User not authenticated");
  }

  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id)
    .eq("created_by", userEmail);

  if (error) {
    throw new Error(`Failed to delete client: ${error.message}`);
  }
}
