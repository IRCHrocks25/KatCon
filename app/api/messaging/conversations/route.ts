import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// GET: List all conversations for the current user
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "Unauthorized", conversations: [] },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // Service-role client for reading conversations (bypassing RLS) while still
    // enforcing access rules in this API layer.
    const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized", conversations: [] },
        { status: 401 }
      );
    }

    // Get all conversations where user is a participant
    const { data: participantRows, error: participantsError } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);

    if (participantsError) {
      console.error("Error fetching participants:", participantsError);
      return NextResponse.json(
        { error: "Failed to fetch conversations", conversations: [] },
        { status: 500 }
      );
    }

    const joinedConversationIds = new Set(
      (participantRows || []).map((p) => p.conversation_id)
    );

    // Get all public channels (visible to everyone).
    // Use service role so RLS on conversations does not hide them.
    const { data: publicChannels, error: publicChannelsError } =
      await adminSupabase
        .from("conversations")
        .select("id")
        .eq("type", "channel")
        .eq("is_private", false);

    if (publicChannelsError) {
      console.error("Error fetching public channels:", publicChannelsError);
      return NextResponse.json(
        { error: "Failed to fetch conversations", conversations: [] },
        { status: 500 }
      );
    }

    const publicConversationIds = new Set(
      (publicChannels || []).map((c) => c.id)
    );

    // Union of joined conversations and public channels
    const allConversationIds = new Set<string>([
      ...joinedConversationIds,
      ...publicConversationIds,
    ]);

    if (allConversationIds.size === 0) {
      return NextResponse.json({ conversations: [] });
    }

    const conversationIds = Array.from(allConversationIds);

    // Get conversations (both joined and public) with service role.
    const { data: conversations, error: conversationsError } =
      await adminSupabase
        .from("conversations")
        .select("*")
        .in("id", conversationIds)
        .order("updated_at", { ascending: false });

    if (conversationsError) {
      console.error("Error fetching conversations:", conversationsError);
      return NextResponse.json(
        { error: "Failed to fetch conversations", conversations: [] },
        { status: 500 }
      );
    }

    // Get participants for each conversation (for joined conversations only)
    const { data: allParticipants, error: allParticipantsError } =
      await supabase
        .from("conversation_participants")
        .select("conversation_id, user_id")
        .in("conversation_id", conversationIds);

    if (allParticipantsError) {
      console.error("Error fetching all participants:", allParticipantsError);
    }

    // Get user profiles for participants
    const participantUserIds = [
      ...new Set(allParticipants?.map((p) => p.user_id) || []),
    ];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, fullname, username, avatar_url")
      .in("id", participantUserIds);

    const profileMap = new Map<string, any>();
    (profiles || []).forEach((p) => {
      profileMap.set(p.id, p);
    });

    // Get last message for each conversation
    const { data: lastMessages } = await supabase
      .from("messages")
      .select("id, conversation_id, author_id, content, created_at")
      .in("conversation_id", conversationIds)
      .is("parent_message_id", null)
      .order("created_at", { ascending: false });

    // Group by conversation_id and get the most recent
    const lastMessageMap = new Map<string, any>();
    (lastMessages || []).forEach((msg) => {
      if (!lastMessageMap.has(msg.conversation_id)) {
        lastMessageMap.set(msg.conversation_id, msg);
      }
    });

    // Calculate unread counts efficiently
    const unreadCounts = new Map<string, number>();

    // Get all unread messages (top-level only, not from current user)
    const { data: unreadMessages } = await supabase
      .from("messages")
      .select("id, conversation_id")
      .in("conversation_id", conversationIds)
      .is("parent_message_id", null)
      .neq("author_id", user.id);

    if (unreadMessages && unreadMessages.length > 0) {
      const unreadMessageIds = unreadMessages.map((m) => m.id);

      // Get all read messages for this user
      const { data: readMessages } = await supabase
        .from("message_reads")
        .select("message_id")
        .eq("user_id", user.id)
        .in("message_id", unreadMessageIds);

      const readMessageIds = new Set(
        readMessages?.map((r) => r.message_id) || []
      );

      // Count unread per conversation
      unreadMessages.forEach((msg) => {
        if (!readMessageIds.has(msg.id)) {
          unreadCounts.set(
            msg.conversation_id,
            (unreadCounts.get(msg.conversation_id) || 0) + 1
          );
        }
      });
    }

    // Set 0 for conversations with no unread
    conversationIds.forEach((convId) => {
      if (!unreadCounts.has(convId)) {
        unreadCounts.set(convId, 0);
      }
    });

    // Format response
    const formattedConversations = (conversations || []).map((conv) => {
      const isJoined = joinedConversationIds.has(conv.id);

      const convParticipants = isJoined
        ? allParticipants?.filter((p) => p.conversation_id === conv.id) || []
        : [];

      const participantProfiles = convParticipants
        .map((p) => {
          const profile = profileMap.get(p.user_id);
          return {
            userId: p.user_id,
            email: profile?.email || "",
            fullname: profile?.fullname || null,
            username: profile?.username || null,
            avatarUrl: profile?.avatar_url || null,
          };
        })
        .filter((p) => p.email); // Only include users with profiles

      const lastMsg = lastMessageMap.get(conv.id);
      const lastMsgProfile = lastMsg ? profileMap.get(lastMsg.author_id) : null;

      return {
        id: conv.id,
        name: conv.name,
        description: conv.description,
        type: conv.type,
        is_private: conv.is_private,
        is_joined: isJoined,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        created_by: conv.created_by ?? null,
        participants: participantProfiles,
        last_message: lastMsg
          ? {
              id: lastMsg.id,
              conversation_id: lastMsg.conversation_id,
              author_id: lastMsg.author_id,
              author_email: lastMsgProfile?.email || "",
              author_fullname: lastMsgProfile?.fullname || null,
              content: lastMsg.content,
              created_at: lastMsg.created_at,
            }
          : null,
        unread_count: unreadCounts.get(conv.id) || 0,
      };
    });

    return NextResponse.json({ conversations: formattedConversations });
  } catch (error) {
    console.error("Error in conversations GET API route:", error);
    return NextResponse.json(
      { error: "Internal server error", conversations: [] },
      { status: 500 }
    );
  }
}

// POST: Create a new channel or DM
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
    const { type, name, description, is_private, participant_ids } = body;

    if (!type || (type !== "channel" && type !== "dm")) {
      return NextResponse.json(
        { error: "Invalid conversation type" },
        { status: 400 }
      );
    }

    // For channels, validate required fields
    if (type === "channel") {
      if (!name || name.trim().length === 0) {
        return NextResponse.json(
          { error: "Channel name is required" },
          { status: 400 }
        );
      }

      // Use service role to create channel (bypass RLS)
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      // Create channel (allow all users)
      const { data: conversation, error: convError } = await adminSupabase
        .from("conversations")
        .insert({
          type: "channel",
          name: name.trim(),
          description: description?.trim() || null,
          is_private: is_private || false,
          created_by: user.id,
        })
        .select()
        .single();

      if (convError || !conversation) {
        console.error("Error creating channel:", convError);
        return NextResponse.json(
          { error: "Failed to create channel" },
          { status: 500 }
        );
      }

      // Add participants (including creator)
      const allParticipantIds = [
        ...new Set([user.id, ...(participant_ids || [])]),
      ];
      const participantInserts = allParticipantIds.map((pid) => ({
        conversation_id: conversation.id,
        user_id: pid,
      }));

      const { error: participantsError } = await adminSupabase
        .from("conversation_participants")
        .insert(participantInserts);

      if (participantsError) {
        console.error("Error adding participants:", participantsError);
        // Continue anyway - channel is created
      }

      // Get participants with profiles
      const { data: participantProfiles } = await adminSupabase
        .from("profiles")
        .select("id, email, fullname, username, avatar_url")
        .in("id", allParticipantIds);

      return NextResponse.json({
        conversation: {
          id: conversation.id,
          name: conversation.name,
          description: conversation.description,
          type: conversation.type,
          is_private: conversation.is_private,
          created_at: conversation.created_at,
          updated_at: conversation.updated_at,
          created_by: conversation.created_by ?? user.id,
          participants:
            participantProfiles?.map((p) => ({
              userId: p.id,
              email: p.email || "",
              fullname: p.fullname || null,
              username: p.username || null,
              avatarUrl: p.avatar_url || null,
            })) || [],
        },
      });
    } else {
      // DM creation
      if (!participant_ids || participant_ids.length !== 1) {
        return NextResponse.json(
          { error: "DM requires exactly one participant" },
          { status: 400 }
        );
      }

      const otherUserId = participant_ids[0];
      if (otherUserId === user.id) {
        return NextResponse.json(
          { error: "Cannot create DM with yourself" },
          { status: 400 }
        );
      }

      // Check if DM already exists between these two specific users
      // Strategy: Find all DMs where current user is a participant,
      // then check if any of those also have the other user and exactly 2 participants total

      // Get all conversations where current user is a participant
      const { data: userParticipations, error: userPartError } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id);

      if (userPartError) {
        console.error("Error fetching user participations:", userPartError);
      }

      const userConvIds =
        userParticipations?.map((p) => p.conversation_id) || [];

      if (userConvIds.length > 0) {
        // Get all DM conversations where current user participates
        const { data: userDMs, error: dmsError } = await supabase
          .from("conversations")
          .select("id")
          .in("id", userConvIds)
          .eq("type", "dm");

        if (dmsError) {
          console.error("Error fetching user DMs:", dmsError);
        }

        const userDMIds = userDMs?.map((dm) => dm.id) || [];

        if (userDMIds.length > 0) {
          // Check if any of these DMs also have the other user as a participant
          const { data: otherUserParticipations, error: otherPartError } =
            await supabase
              .from("conversation_participants")
              .select("conversation_id")
              .eq("user_id", otherUserId)
              .in("conversation_id", userDMIds);

          if (otherPartError) {
            console.error(
              "Error fetching other user participations:",
              otherPartError
            );
          }

          const sharedDMIds =
            otherUserParticipations?.map((p) => p.conversation_id) || [];

          // For each shared DM, verify it has exactly 2 participants
          // This ensures it's a DM between just these two users (not a group DM)
          for (const dmId of sharedDMIds) {
            const { data: participants, error: partError } = await supabase
              .from("conversation_participants")
              .select("user_id")
              .eq("conversation_id", dmId);

            if (partError) {
              console.error("Error checking participants:", partError);
              continue;
            }

            // If exactly 2 participants (current user + other user), DM exists
            if (participants && participants.length === 2) {
              // Verify both participants are the expected users
              const participantIds = new Set(
                participants.map((p) => p.user_id)
              );
              if (
                participantIds.has(user.id) &&
                participantIds.has(otherUserId)
              ) {
                // DM already exists, return it
                const { data: conv } = await supabase
                  .from("conversations")
                  .select("*")
                  .eq("id", dmId)
                  .single();

                if (conv) {
                  const { data: profiles } = await supabase
                    .from("profiles")
                    .select("id, email, fullname, username, avatar_url")
                    .in("id", Array.from(participantIds));

                  return NextResponse.json({
                    conversation: {
                      id: conv.id,
                      name: conv.name,
                      description: conv.description,
                      type: conv.type,
                      is_private: conv.is_private,
                      created_at: conv.created_at,
                      updated_at: conv.updated_at,
                      created_by: conv.created_by ?? user.id,
                      participants:
                        profiles?.map((p) => ({
                          userId: p.id,
                          email: p.email || "",
                          fullname: p.fullname || null,
                          username: p.username || null,
                          avatarUrl: p.avatar_url || null,
                        })) || [],
                    },
                  });
                }
              }
            }
          }
        }
      }

      // Create new DM
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      const { data: conversation, error: convError } = await adminSupabase
        .from("conversations")
        .insert({
          type: "dm",
          name: null,
          description: null,
          is_private: true,
          created_by: user.id,
        })
        .select()
        .single();

      if (convError || !conversation) {
        console.error("Error creating DM:", convError);
        return NextResponse.json(
          { error: "Failed to create DM" },
          { status: 500 }
        );
      }

      // Add both users as participants
      const { error: participantsError } = await adminSupabase
        .from("conversation_participants")
        .insert([
          { conversation_id: conversation.id, user_id: user.id },
          { conversation_id: conversation.id, user_id: otherUserId },
        ]);

      if (participantsError) {
        console.error("Error adding participants:", participantsError);
      }

      // Get participants with profiles
      const { data: participantProfiles } = await adminSupabase
        .from("profiles")
        .select("id, email, fullname, username, avatar_url")
        .in("id", [user.id, otherUserId]);

      return NextResponse.json({
        conversation: {
          id: conversation.id,
          name: conversation.name,
          description: conversation.description,
          type: conversation.type,
          is_private: conversation.is_private,
          created_at: conversation.created_at,
          updated_at: conversation.updated_at,
          created_by: conversation.created_by ?? user.id,
          participants:
            participantProfiles?.map((p) => ({
              userId: p.id,
              email: p.email || "",
              fullname: p.fullname || null,
              username: p.username || null,
              avatarUrl: p.avatar_url || null,
            })) || [],
        },
      });
    }
  } catch (error) {
    console.error("Error in conversations POST API route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
