import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { moderateRateLimit } from "@/lib/utils/rate-limit";
import type { AccountType, UserRole } from "@/lib/supabase/auth";

interface ProfileUpdate {
  approved?: boolean;
  role?: UserRole;
  account_type?: AccountType;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// GET: List all users (admin only)
export const GET = moderateRateLimit(async (request: NextRequest) => {
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

    // Check if user is admin or manager
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

    // Use service role for admin operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all users with their profiles
    const { data: users, error: usersError } = await adminSupabase
      .from("profiles")
      .select(
        `
        id,
        email,
        fullname,
        username,
        account_type,
        approved,
        role,
        avatar_url,
        created_at,
        updated_at
      `
      )
      .order("created_at", { ascending: false });

    if (usersError) {
      console.error("Error fetching users:", usersError);
      return NextResponse.json(
        { error: "Failed to fetch users" },
        { status: 500 }
      );
    }

    return NextResponse.json({ users: users || [] });
  } catch (error) {
    console.error("Error in admin users GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

// POST: Update user status (approve/reject, change role, etc.)
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
      data: { user: adminUser },
      error: userError,
    } = await userSupabase.auth.getUser();

    if (userError || !adminUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin or manager
    const { data: adminProfile } = await userSupabase
      .from("profiles")
      .select("role")
      .eq("id", adminUser.id)
      .single();

    if (!adminProfile || (adminProfile.role !== "admin" && adminProfile.role !== "manager")) {
      return NextResponse.json(
        { error: "Admin or Manager access required" },
        { status: 403 }
      );
    }

    // Use service role for admin operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await request.json();
    const { userId, action, role, accountType } = body;

    if (!action) {
      return NextResponse.json(
        { error: "Missing required field: action" },
        { status: 400 }
      );
    }

    // userId is only required for actions that operate on existing users
    const actionsRequiringUserId = [
      "approve",
      "reject",
      "update_role",
      "update_account_type",
      "update_user",
      "delete_user",
    ];
    if (actionsRequiringUserId.includes(action) && !userId) {
      return NextResponse.json(
        {
          error: `Missing required field: userId (required for action: ${action})`,
        },
        { status: 400 }
      );
    }

    // Validate action
    const validActions = [
      "approve",
      "reject",
      "update_role",
      "update_account_type",
      "create_user",
      "update_user",
      "delete_user",
    ];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be one of: " + validActions.join(", ") },
        { status: 400 }
      );
    }

    let result;
    let message;

    switch (action) {
      case "approve":
      case "reject":
      case "update_role":
      case "update_account_type":
        const updates: ProfileUpdate = {};

        if (action === "approve") {
          updates.approved = true;
        } else if (action === "reject") {
          updates.approved = false;
        } else if (action === "update_role") {
          if (!role || !["user", "manager", "admin"].includes(role)) {
            return NextResponse.json(
              { error: "Invalid role. Must be 'user', 'manager', or 'admin'" },
              { status: 400 }
            );
          }
          updates.role = role as UserRole;
        } else if (action === "update_account_type") {
          if (
            !accountType ||
            ![
              "CRM",
              "DEV",
              "PM",
              "AI",
              "DESIGN",
              "COPYWRITING",
              "OTHERS",
            ].includes(accountType)
          ) {
            return NextResponse.json(
              { error: "Invalid account type" },
              { status: 400 }
            );
          }
          updates.account_type = accountType as AccountType;
        }

        // Update the user profile
        const { data: updatedUser, error: updateError } = await adminSupabase
          .from("profiles")
          .update(updates)
          .eq("id", userId)
          .select()
          .single();

        if (updateError) {
          console.error("Error updating user:", updateError);
          return NextResponse.json(
            { error: "Failed to update user", details: updateError.message },
            { status: 500 }
          );
        }

        result = updatedUser;
        if (action === "update_role") {
          const roleNames = { user: "User", manager: "Manager", admin: "Admin" };
          message = `User role updated to ${roleNames[role as keyof typeof roleNames] || role}`;
        } else if (action === "update_account_type") {
          message = `Account type updated to ${accountType}`;
        } else {
          message = `User ${action.replace("_", " ")} successful`;
        }
        break;

      case "create_user":
        const {
          email: newEmail,
          password: newPassword,
          fullname: newFullname,
          accountType: newAccountType,
          role: newRole,
        } = body;

        if (!newEmail || !newPassword) {
          return NextResponse.json(
            { error: "Email and password are required" },
            { status: 400 }
          );
        }

        // Create user via Supabase Auth Admin API
        const { data: authData, error: authError } =
          await adminSupabase.auth.admin.createUser({
            email: newEmail,
            password: newPassword,
            email_confirm: true,
          });

        if (authError) {
          return NextResponse.json(
            {
              error: "Failed to create user account",
              details: authError.message,
            },
            { status: 500 }
          );
        }

        // Create profile
        const { data: newUser, error: profileError } = await adminSupabase
          .from("profiles")
          .insert({
            id: authData.user.id,
            email: newEmail,
            fullname: newFullname || null,
            account_type: newAccountType || "OTHERS",
            approved: true, // Admin-created users are auto-approved
            role: newRole || "user",
          })
          .select()
          .single();

        if (profileError) {
          return NextResponse.json(
            {
              error: "Failed to create user profile",
              details: profileError.message,
            },
            { status: 500 }
          );
        }

        result = newUser;
        message = "User created successfully";
        break;

      case "update_user":
        const { email: updateEmail, fullname: updateFullname } = body;

        if (!userId) {
          return NextResponse.json(
            { error: "User ID is required for update" },
            { status: 400 }
          );
        }

        const updateData: Record<string, string | null> = {};
        if (updateEmail !== undefined) updateData.email = updateEmail;
        if (updateFullname !== undefined) updateData.fullname = updateFullname;

        // Update profile
        const { data: updatedProfile, error: profileUpdateError } =
          await adminSupabase
            .from("profiles")
            .update(updateData)
            .eq("id", userId)
            .select()
            .single();

        if (profileUpdateError) {
          return NextResponse.json(
            {
              error: "Failed to update user",
              details: profileUpdateError.message,
            },
            { status: 500 }
          );
        }

        result = updatedProfile;
        message = "User updated successfully";
        break;

      case "delete_user":
        if (!userId) {
          return NextResponse.json(
            { error: "User ID is required for deletion" },
            { status: 400 }
          );
        }

        // Delete from auth.users (this will cascade to profiles due to foreign key)
        const { error: deleteError } =
          await adminSupabase.auth.admin.deleteUser(userId);

        if (deleteError) {
          return NextResponse.json(
            { error: "Failed to delete user", details: deleteError.message },
            { status: 500 }
          );
        }

        result = { id: userId };
        message = "User deleted successfully";
        break;
    }

    return NextResponse.json({
      success: true,
      message,
      user: result,
    });
  } catch (error) {
    console.error("Error in admin users POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
