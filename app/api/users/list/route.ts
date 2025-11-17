import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Create admin client for fetching all users
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function GET(request: NextRequest) {
  try {
    // Create admin client with service role key
    if (!supabaseServiceRoleKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY not set");
      return NextResponse.json(
        { error: "Server configuration error", users: [] },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Fetch all users from auth.users using admin API
    const { data: authData, error: authError } =
      await supabase.auth.admin.listUsers();

    if (authError) {
      console.error("Error fetching users from auth:", authError);
      return NextResponse.json(
        { error: "Failed to fetch users", users: [] },
        { status: 500 }
      );
    }

    // Get all user IDs
    const userIds = authData.users.map((user) => user.id);

    if (userIds.length === 0) {
      return NextResponse.json({ users: [] });
    }

    // Fetch profiles for these users to get account_type and fullname
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, account_type, fullname, approved")
      .in("id", userIds);

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      return NextResponse.json(
        { error: "Failed to fetch user profiles", users: [] },
        { status: 500 }
      );
    }

    // Filter to only approved users and map to the desired format
    const users = profiles
      .filter((profile) => profile.approved === true)
      .map((profile) => ({
        email: profile.email,
        fullname: profile.fullname || undefined,
        accountType: profile.account_type,
      }))
      .sort((a, b) => {
        // Sort by account type first, then by email
        if (a.accountType !== b.accountType) {
          return a.accountType.localeCompare(b.accountType);
        }
        return a.email.localeCompare(b.email);
      });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Error in users/list API route:", error);
    return NextResponse.json(
      { error: "Internal server error", users: [] },
      { status: 500 }
    );
  }
}
