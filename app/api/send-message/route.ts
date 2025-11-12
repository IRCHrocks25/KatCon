import { NextRequest, NextResponse } from "next/server";
import { robustFetch } from "@/lib/utils/fetch";

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

    // Prepare webhook payload (includes userEmail from request body)
    const webhookPayload = {
      message: body.message,
      timestamp: body.timestamp,
      sessionId: body.sessionId,
      ...(body.userEmail && { userEmail: body.userEmail }),
    };

    // Use robustFetch for webhook calls with connection management
    // Force close connections for external webhooks to prevent stale connection issues
    try {
      const response = await robustFetch(
        "https://katalyst-crm.fly.dev/webhook/send-message",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(webhookPayload),
          retries: 2,
          timeout: 30000,
          forceCloseConnection: true, // External webhook - prevent stale connections
        }
      );

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
      if (fetchError instanceof Error) {
        if (fetchError.message.includes("timeout")) {
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
