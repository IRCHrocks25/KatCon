import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

export async function POST(request: NextRequest) {
  try {
    // Call the database function to update expired statuses
    const { data, error } = await supabase.rpc('update_expired_user_statuses');

    if (error) {
      console.error("Error updating expired user statuses:", error);
      return NextResponse.json(
        { error: "Failed to update expired statuses" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Expired user statuses updated successfully"
    });
  } catch (error) {
    console.error("Error in update-expired-statuses API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
