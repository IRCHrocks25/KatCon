import { NextResponse } from "next/server";
import { notifyStaleTasks } from "@/lib/supabase/reminders";

export async function POST() {
  try {
    // This endpoint should be called by a background job/cron
    // For now, it's a simple POST endpoint that can be called manually or scheduled

    await notifyStaleTasks();

    return NextResponse.json({
      success: true,
      message: "Stale task notifications processed successfully",
    });
  } catch (error) {
    console.error("Error in notify-stale route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
