import { NextRequest, NextResponse } from "next/server";
import { validateAuth } from "@/lib/auth/middleware";
import { supabase } from "@/lib/supabase/client";

export async function POST(request: NextRequest) {
  try {
    // Validate JWT token and get authenticated user
    const authResult = await validateAuth(request);
    if (authResult.error) {
      return authResult.error;
    }

    const { user } = authResult;
    const { conversationId, messageId, mentionedBy, channelName } =
      await request.json();

    // Validate required fields
    if (!conversationId || !mentionedBy || !channelName) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: conversationId, mentionedBy, channelName",
        },
        { status: 400 }
      );
    }

    // Get all participants in the conversation (excluding the sender)
    const { data: participants, error: participantsError } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .neq("user_id", user.id); // Exclude the sender

    if (participantsError) {
      console.error(
        "Error fetching conversation participants:",
        participantsError
      );
      return NextResponse.json(
        { error: "Failed to fetch conversation participants" },
        { status: 500 }
      );
    }

    if (!participants || participants.length === 0) {
      console.log(
        "[MENTIONS] No other participants found in conversation:",
        conversationId
      );
      return NextResponse.json({ success: true, notifications_created: 0 });
    }

    // Get user emails for participants
    const participantIds = participants.map((p) => p.user_id);
    const { data: users, error: usersError } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", participantIds)
      .eq("approved", true);

    if (usersError || !users) {
      console.error("Error fetching user emails:", usersError);
      return NextResponse.json(
        { error: "Failed to fetch user information" },
        { status: 500 }
      );
    }

    // Create notifications for each participant
    const notifications = users.map((participant) => ({
      user_email: participant.email,
      type: "mention_everyone",
      title: "@everyone mention",
      message: `You were mentioned in ${channelName}`,
      conversation_id: conversationId,
      message_id: messageId,
      read: false,
      metadata: {
        mentioned_by: mentionedBy,
        channel_name: channelName,
        mention_type: "everyone",
      },
    }));

    // Insert notifications
    const { data: insertedNotifications, error: insertError } = await supabase
      .from("notifications")
      .insert(notifications)
      .select("id");

    if (insertError) {
      console.error("Error creating @everyone notifications:", insertError);
      return NextResponse.json(
        {
          error: "Failed to create notifications",
          details: insertError.message,
        },
        { status: 500 }
      );
    }

    console.log(
      `[MENTIONS] Created ${
        insertedNotifications?.length || 0
      } @everyone notifications for conversation ${conversationId}`
    );

    return NextResponse.json({
      success: true,
      notifications_created: insertedNotifications?.length || 0,
      conversation_id: conversationId,
      channel_name: channelName,
    });
  } catch (error) {
    console.error("Error in @everyone notification endpoint:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
