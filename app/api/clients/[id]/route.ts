import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { moderateRateLimit } from "@/lib/utils/rate-limit";
import { updateClient, deleteClient } from "@/lib/supabase/clients";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// PUT: Update a client
export const PUT = moderateRateLimit(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
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

    // Check if user is admin or manager (both can update clients)
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

    const { id: clientId } = await params;
    if (!clientId) {
      return NextResponse.json(
        { error: "Client ID is required" },
        { status: 400 }
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

    // Update client directly in the database since we already have user authentication
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: clientData, error: updateError } = await adminSupabase
      .from("clients")
      .update({
        name: name.trim(),
        company: company?.trim() || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", clientId)
      .eq("created_by", user.email) // Only creator can update
      .select()
      .single();

    if (updateError) {
      console.error("Error updating client:", updateError);
      return NextResponse.json(
        { error: "Client not found or access denied" },
        { status: 404 }
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
      message: "Client updated successfully",
      client,
    });
  } catch (error) {
    console.error("Error in client PUT:", error);

    // Handle specific error cases
    if (error instanceof Error && error.message?.includes("Failed to update client")) {
      return NextResponse.json(
        { error: "Client not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update client" },
      { status: 500 }
    );
  }
});

// DELETE: Delete a client
export const DELETE = moderateRateLimit(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
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

    // Check if user is admin or manager (both can delete clients)
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

    const { id: clientId } = await params;
    if (!clientId) {
      return NextResponse.json(
        { error: "Client ID is required" },
        { status: 400 }
      );
    }

    // Delete client directly in the database since we already have user authentication
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
    const { error: deleteError } = await adminSupabase
      .from("clients")
      .delete()
      .eq("id", clientId)
      .eq("created_by", user.email); // Only creator can delete

    if (deleteError) {
      console.error("Error deleting client:", deleteError);
      return NextResponse.json(
        { error: "Client not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Client deleted successfully",
    });
  } catch (error) {
    console.error("Error in client DELETE:", error);

    // Handle specific error cases
    if (error instanceof Error && error.message?.includes("Failed to delete client")) {
      return NextResponse.json(
        { error: "Client not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to delete client" },
      { status: 500 }
    );
  }
});