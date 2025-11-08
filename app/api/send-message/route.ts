import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    if (!body.message || !body.sessionId) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          details: "message and sessionId are required",
        },
        { status: 400 }
      );
    }

    // Set timeout for the fetch request (30 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(
        "https://katalyst-crm.fly.dev/webhook/send-message",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response
          .text()
          .catch(() => response.statusText);
        console.error("Webhook error:", response.status, errorText);
        return NextResponse.json(
          { error: "Failed to send message", details: errorText },
          { status: response.status }
        );
      }

      const data = await response.json().catch(() => ({}));
      return NextResponse.json(data, { status: 200 });
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);

      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return NextResponse.json(
          {
            error: "Request timeout",
            details: "The server took too long to respond",
          },
          { status: 504 }
        );
      }
      throw fetchError;
    }
  } catch (error) {
    console.error("Error in send-message API route:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
