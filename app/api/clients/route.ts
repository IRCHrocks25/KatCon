import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { moderateRateLimit } from "@/lib/utils/rate-limit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Database client format
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

// GET: List all clients for the authenticated user
export const GET = moderateRateLimit(async (request: NextRequest) => {
  try {
    // First, validate the user with their token
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const userSupabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userSupabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // All authenticated users can read clients they created
    // No role restriction for reading

    // Get all clients in the system for all authenticated users
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: clientsData, error: clientsError } = await adminSupabase
      .from("clients")
      .select("*")
      .order("name");

    if (clientsError) {
      console.error("Error fetching clients:", clientsError);
      return NextResponse.json(
        { error: "Failed to fetch clients" },
        { status: 500 }
      );
    }

    // Convert to app format
    const clients = (clientsData || []).map((client: DatabaseClient) => ({
      id: client.id,
      name: client.name,
      company: client.company || undefined,
      email: client.email || undefined,
      phone: client.phone || undefined,
      address: client.address || undefined,
      notes: client.notes || undefined,
      createdBy: client.created_by,
      createdAt: new Date(client.created_at),
      updatedAt: new Date(client.updated_at),
    }));

    return NextResponse.json({ clients });
  } catch (error) {
    console.error("Error in clients GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

// POST: Create a new client
export const POST = moderateRateLimit(async (request: NextRequest) => {
  try {
    // First, validate the admin user with their token
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const userSupabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userSupabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin or manager (both can create clients)
    const { data: profile } = await userSupabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
      return NextResponse.json(
        { error: "Admin or Manager access required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, company, email, phone, address, notes } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Client name is required" },
        { status: 400 }
      );
    }

    // Validate email if provided
    if (email && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return NextResponse.json(
          { error: "Invalid email format" },
          { status: 400 }
        );
      }
    }

    // Create client directly in the database since we already have user authentication
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: clientData, error: insertError } = await adminSupabase
      .from("clients")
      .insert({
        name: name.trim(),
        company: company?.trim() || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
        created_by: user.email,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating client:", insertError);
      return NextResponse.json(
        { error: "Failed to create client" },
        { status: 500 }
      );
    }

    // Convert to app format
    const client = {
      id: clientData.id,
      name: clientData.name,
      company: clientData.company || undefined,
      email: clientData.email || undefined,
      phone: clientData.phone || undefined,
      address: clientData.address || undefined,
      notes: clientData.notes || undefined,
      createdBy: clientData.created_by,
      createdAt: new Date(clientData.created_at),
      updatedAt: new Date(clientData.updated_at),
    };

    return NextResponse.json({
      success: true,
      message: "Client created successfully",
      client,
    });
  } catch (error) {
    console.error("Error in clients POST:", error);
    return NextResponse.json(
      { error: "Failed to create client" },
      { status: 500 }
    );
  }
});
