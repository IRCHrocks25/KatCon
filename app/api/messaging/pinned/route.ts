import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// GET: Get pinned messages for a conversation
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
    const conversationId = searchParams.get("conversationId");

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    // Verify user is a participant
    const { data: participant } = await supabase
      .from("conversation_participants")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .single();

    if (!participant) {
      return NextResponse.json(
        { error: "Not a participant in this conversation" },
        { status: 403 }
      );
    }

    // Get pinned messages
    const { data: pinnedMessages, error: pinnedError } = await supabase
      .from("pinned_messages")
      .select(
        `
        id,
        message_id,
        pinned_by_user_id,
        pinned_at,
        message:messages!inner(
          id,
          content,
          created_at,
          author_id
        )
      `
      )
      .eq("conversation_id", conversationId)
      .is("unpinned_at", null)
      .order("pinned_at", { ascending: false });

    if (pinnedError) {
      console.error("Error fetching pinned messages:", pinnedError);
      return NextResponse.json(
        { error: "Failed to fetch pinned messages" },
        { status: 500 }
      );
    }

    // Get profiles for message authors and users who pinned
    const authorIds = new Set<string>();
    const pinnedByIds = new Set<string>();
    (pinnedMessages || []).forEach((pm: any) => {
      if (pm.message?.author_id) authorIds.add(pm.message.author_id);
      if (pm.pinned_by_user_id) pinnedByIds.add(pm.pinned_by_user_id);
    });

    const allUserIds = [...new Set([...authorIds, ...pinnedByIds])];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, fullname, username, avatar_url")
      .in("id", allUserIds);

    const profileMap = new Map();
    (profiles || []).forEach((p: any) => {
      profileMap.set(p.id, p);
    });

    // Format response
    const formatted = (pinnedMessages || []).map((pm: any) => {
      const message = pm.message;
      const authorProfile = profileMap.get(message?.author_id);
      const pinnedByProfile = profileMap.get(pm.pinned_by_user_id);

      return {
        id: pm.id,
        messageId: pm.message_id,
        message: {
          id: message?.id,
          content: message?.content,
          createdAt: message?.created_at,
          author: {
            id: message?.author_id,
            email: authorProfile?.email || "",
            fullname: authorProfile?.fullname || null,
            username: authorProfile?.username || null,
            avatarUrl: authorProfile?.avatar_url || null,
          },
        },
        pinnedBy: {
          id: pm.pinned_by_user_id,
          email: pinnedByProfile?.email || "",
          fullname: pinnedByProfile?.fullname || null,
        },
        pinnedAt: pm.pinned_at,
      };
    });

    return NextResponse.json({ pinnedMessages: formatted });
  } catch (error) {
    console.error("Error in pinned messages API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Pin a message
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
    const { messageId } = body;

    if (!messageId) {
      return NextResponse.json(
        { error: "messageId is required" },
        { status: 400 }
      );
    }

    // Get message and verify it exists
    const { data: message, error: messageError } = await supabase
      .from("messages")
      .select("conversation_id")
      .eq("id", messageId)
      .single();

    if (messageError || !message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    // Verify user is a participant
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

    // Check if message is already pinned
    const { data: existingPin } = await supabase
      .from("pinned_messages")
      .select("id")
      .eq("message_id", messageId)
      .eq("conversation_id", message.conversation_id)
      .is("unpinned_at", null)
      .single();

    if (existingPin) {
      return NextResponse.json(
        { error: "Message is already pinned" },
        { status: 400 }
      );
    }

    // If there's an old pin (unpinned), update it, otherwise create new
    const { data: oldPin } = await supabase
      .from("pinned_messages")
      .select("id")
      .eq("message_id", messageId)
      .eq("conversation_id", message.conversation_id)
      .not("unpinned_at", "is", null)
      .single();

    if (oldPin) {
      // Reactivate old pin
      const { data: pinnedMessage, error: updateError } = await supabase
        .from("pinned_messages")
        .update({
          pinned_by_user_id: user.id,
          pinned_at: new Date().toISOString(),
          unpinned_at: null,
        })
        .eq("id", oldPin.id)
        .select()
        .single();

      if (updateError) {
        console.error("Error pinning message:", updateError);
        return NextResponse.json(
          { error: "Failed to pin message" },
          { status: 500 }
        );
      }

      return NextResponse.json({ pinnedMessage });
    } else {
      // Create new pin
      const { data: pinnedMessage, error: insertError } = await supabase
        .from("pinned_messages")
        .insert({
          message_id: messageId,
          conversation_id: message.conversation_id,
          pinned_by_user_id: user.id,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error pinning message:", insertError);
        return NextResponse.json(
          { error: "Failed to pin message" },
          { status: 500 }
        );
      }

      return NextResponse.json({ pinnedMessage });
    }
  } catch (error) {
    console.error("Error in pin message API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE: Unpin a message
export async function DELETE(request: NextRequest) {
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

    // Get pinned message
    const { data: pinnedMessage, error: fetchError } = await supabase
      .from("pinned_messages")
      .select("conversation_id")
      .eq("message_id", messageId)
      .is("unpinned_at", null)
      .single();

    if (fetchError || !pinnedMessage) {
      return NextResponse.json(
        { error: "Pinned message not found" },
        { status: 404 }
      );
    }

    // Verify user is a participant
    const { data: participant } = await supabase
      .from("conversation_participants")
      .select("id")
      .eq("conversation_id", pinnedMessage.conversation_id)
      .eq("user_id", user.id)
      .single();

    if (!participant) {
      return NextResponse.json(
        { error: "Not a participant in this conversation" },
        { status: 403 }
      );
    }

    // Soft delete: set unpinned_at
    const { error: updateError } = await supabase
      .from("pinned_messages")
      .update({ unpinned_at: new Date().toISOString() })
      .eq("message_id", messageId)
      .is("unpinned_at", null);

    if (updateError) {
      console.error("Error unpinning message:", updateError);
      return NextResponse.json(
        { error: "Failed to unpin message" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in unpin message API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


