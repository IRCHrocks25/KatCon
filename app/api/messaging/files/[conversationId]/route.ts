import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// GET: Get all files shared in a conversation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "Unauthorized", files: [] },
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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized", files: [] },
        { status: 401 }
      );
    }

    const { conversationId } = await params;
    const { searchParams } = new URL(request.url);

    // Query params for filtering and sorting
    const typeFilter = searchParams.get("type"); // 'images' | 'documents' | 'other' | null (all)
    const searchQuery = searchParams.get("search"); // filename search
    const sortOrder = searchParams.get("sort") || "desc"; // 'asc' | 'desc'

    // Verify user is a participant
    const { data: participant } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .single();

    if (!participant) {
      return NextResponse.json(
        { error: "Conversation not found or access denied", files: [] },
        { status: 404 }
      );
    }

    // Build query for messages with files
    let query = supabase
      .from("messages")
      .select(
        "id, file_url, file_name, file_type, file_size, author_id, created_at"
      )
      .eq("conversation_id", conversationId)
      .not("file_url", "is", null)
      .order("created_at", { ascending: sortOrder === "asc" });

    // Apply type filter
    if (typeFilter === "images") {
      query = query.like("file_type", "image/%");
    } else if (typeFilter === "documents") {
      query = query.or(
        "file_type.like.application/pdf,file_type.like.application/msword%,file_type.like.application/vnd.openxmlformats%,file_type.like.application/vnd.ms-%,file_type.like.text/%"
      );
    } else if (typeFilter === "other") {
      // Everything except images and common documents
      query = query
        .not("file_type", "like", "image/%")
        .not("file_type", "like", "application/pdf")
        .not("file_type", "like", "application/msword%")
        .not("file_type", "like", "application/vnd.openxmlformats%")
        .not("file_type", "like", "application/vnd.ms-%")
        .not("file_type", "like", "text/%");
    }

    // Apply search filter
    if (searchQuery) {
      query = query.ilike("file_name", `%${searchQuery}%`);
    }

    const { data: messagesWithFiles, error: filesError } = await query;

    if (filesError) {
      console.error("Error fetching files:", filesError);
      return NextResponse.json(
        { error: "Failed to fetch files", files: [] },
        { status: 500 }
      );
    }

    // Get author profiles
    const authorIds = [
      ...new Set((messagesWithFiles || []).map((m) => m.author_id)),
    ];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, fullname")
      .in("id", authorIds);

    const profileMap = new Map<
      string,
      { email: string; fullname: string | null }
    >();
    (profiles || []).forEach((p) => {
      profileMap.set(p.id, { email: p.email || "", fullname: p.fullname });
    });

    // Format response
    const files = (messagesWithFiles || []).map((msg) => {
      const profile = profileMap.get(msg.author_id);
      return {
        id: msg.id,
        file_url: msg.file_url,
        file_name: msg.file_name,
        file_type: msg.file_type,
        file_size: msg.file_size,
        uploaded_by: {
          id: msg.author_id,
          email: profile?.email || "",
          fullname: profile?.fullname || null,
        },
        created_at: msg.created_at,
      };
    });

    return NextResponse.json({ files });
  } catch (error) {
    console.error("Error in files/[conversationId] GET API route:", error);
    return NextResponse.json(
      { error: "Internal server error", files: [] },
      { status: 500 }
    );
  }
}
