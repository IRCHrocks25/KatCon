import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Basic health check - you can expand this with database checks, etc.
    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || "1.0.0",
    };

    return NextResponse.json(health);
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json(
      { status: "unhealthy", error: "Internal server error" },
      { status: 500 }
    );
  }
}