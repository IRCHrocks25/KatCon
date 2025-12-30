import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// POST: Add or remove a reaction
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { messageId, reactionType } = body;

    if (!messageId || !reactionType) {
      return NextResponse.json(
        { error: "messageId and reactionType are required" },
        { status: 400 }
      );
    }

    // Verify user is a participant in the conversation
    const { data: message } = await supabase
      .from("messages")
      .select("conversation_id")
      .eq("id", messageId)
      .single();

    if (!message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    const { data: participant } = await supabase
      .from("conversation_participants")
      .select("id")
      .eq("conversation_id", message.conversation_id)
      .eq("user_id", user.id)
      .single();

    if (!participant) {
      return NextResponse.json(
        { error: "Not a participant in this conversation" },
        { status: 403 }
      );
    }

    // Check if reaction already exists
    const { data: existingReaction } = await supabase
      .from("message_reactions")
      .select("id")
      .eq("message_id", messageId)
      .eq("user_id", user.id)
      .eq("reaction_type", reactionType)
      .single();

    if (existingReaction) {
      // Remove reaction (toggle off)
      const { error: deleteError } = await supabase
        .from("message_reactions")
        .delete()
        .eq("id", existingReaction.id);

      if (deleteError) {
        console.error("Error removing reaction:", deleteError);
        return NextResponse.json(
          { error: "Failed to remove reaction" },
          { status: 500 }
        );
      }

      return NextResponse.json({ action: "removed", reactionType });
    } else {
      // Add reaction (toggle on)
      const { data: reaction, error: insertError } = await supabase
        .from("message_reactions")
        .insert({
          message_id: messageId,
          user_id: user.id,
          reaction_type: reactionType,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error adding reaction:", insertError);
        return NextResponse.json(
          { error: "Failed to add reaction" },
          { status: 500 }
        );
      }

      return NextResponse.json({ action: "added", reaction: reaction });
    }
  } catch (error) {
    console.error("Error in reactions API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: Get reactions for a message
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get("messageId");

    if (!messageId) {
      return NextResponse.json(
        { error: "messageId is required" },
        { status: 400 }
      );
    }

    // Verify user is a participant
    const { data: message } = await supabase
      .from("messages")
      .select("conversation_id")
      .eq("id", messageId)
      .single();

    if (!message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    const { data: participant } = await supabase
      .from("conversation_participants")
      .select("id")
      .eq("conversation_id", message.conversation_id)
      .eq("user_id", user.id)
      .single();

    if (!participant) {
      return NextResponse.json(
        { error: "Not a participant in this conversation" },
        { status: 403 }
      );
    }

    // Get all reactions for this message
    const { data: reactions, error: reactionsError } = await supabase
      .from("message_reactions")
      .select("id, user_id, reaction_type, created_at")
      .eq("message_id", messageId)
      .order("created_at", { ascending: true });

    if (reactionsError) {
      console.error("Error fetching reactions:", reactionsError);
      return NextResponse.json(
        { error: "Failed to fetch reactions" },
        { status: 500 }
      );
    }

    // Get user profiles for reaction authors
    const userIds = [...new Set((reactions || []).map((r) => r.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, fullname, username, avatar_url")
      .in("id", userIds);

    const profileMap = new Map();
    (profiles || []).forEach((p) => {
      profileMap.set(p.id, p);
    });

    // Group reactions by type
    const reactionsByType = new Map<string, any[]>();
    (reactions || []).forEach((reaction) => {
      const profile = profileMap.get(reaction.user_id);
      if (!reactionsByType.has(reaction.reaction_type)) {
        reactionsByType.set(reaction.reaction_type, []);
      }
      reactionsByType.get(reaction.reaction_type)!.push({
        id: reaction.id,
        userId: reaction.user_id,
        userEmail: profile?.email || "",
        userFullname: profile?.fullname || null,
        userAvatarUrl: profile?.avatar_url || null,
        createdAt: reaction.created_at,
      });
    });

    // Format response
    const formattedReactions = Array.from(reactionsByType.entries()).map(
      ([type, users]) => ({
        type,
        count: users.length,
        users: users.map((u) => ({
          id: u.userId,
          email: u.userEmail,
          fullname: u.userFullname,
          avatarUrl: u.userAvatarUrl,
        })),
        currentUserReacted: users.some((u) => u.userId === user.id),
      })
    );

    return NextResponse.json({ reactions: formattedReactions });
  } catch (error) {
    console.error("Error in reactions API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



