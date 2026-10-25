/**
 * /api/ad-analyst/history
 *
 * GET  — fetch all sessions for a cookie-based sessionId
 * POST — save or update a session
 *
 * Uses DynamoDB xpat-ad-conversations table.
 * Credentials come from the Amplify IAM SSR Compute Role (no explicit keys needed).
 * Falls back gracefully if DynamoDB is unavailable.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = process.env.CONVERSATIONS_TABLE ?? "xpat-ad-conversations";
const REGION = process.env.BEDROCK_AWS_REGION ?? "ap-southeast-2"; // DynamoDB is in ap-southeast-2
const TTL_DAYS = 90; // auto-expire sessions after 90 days

// DynamoDB client — uses IAM compute role when running on Amplify
function getClient() {
  return DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: REGION })
  );
}

// Cookie name for session identity
const COOKIE_NAME = "xpat_session_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function generateSessionId() {
  return `u_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// GET — fetch all conversation sessions for the user
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(COOKIE_NAME)?.value;

    if (!sessionId) {
      // No cookie yet — return empty sessions
      return NextResponse.json({ sessions: [] });
    }

    const client = getClient();
    const result = await client.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "sessionId = :sid",
        ExpressionAttributeValues: { ":sid": sessionId },
        ScanIndexForward: false, // newest first
        Limit: 20,
      })
    );

    return NextResponse.json({
      sessions: result.Items ?? [],
      sessionId,
    });
  } catch (err) {
    // Graceful fallback — client will use localStorage
    console.error("[history] GET error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ sessions: [], error: "unavailable" }, { status: 200 });
  }
}

// ---------------------------------------------------------------------------
// POST — save or update a conversation session
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as {
      id?: string;
      title?: string;
      messages?: Array<{ id: string; role: string; text: string }>;
      createdAt?: string;
    };

    if (!body.id || !body.title || !body.messages) {
      return NextResponse.json({ error: "id, title, messages required" }, { status: 400 });
    }

    const cookieStore = await cookies();
    let sessionId = cookieStore.get(COOKIE_NAME)?.value;

    // Generate new session ID if first visit
    const isNew = !sessionId;
    if (!sessionId) {
      sessionId = generateSessionId();
    }

    const client = getClient();
    const expiresAt = Math.floor(Date.now() / 1000) + TTL_DAYS * 24 * 60 * 60;

    await client.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          sessionId,
          createdAt: body.createdAt ?? new Date().toISOString(),
          conversationId: body.id,
          title: body.title,
          messages: body.messages,
          updatedAt: new Date().toISOString(),
          expiresAt,
        },
      })
    );

    const response = NextResponse.json({ ok: true, sessionId });

    // Set cookie if new user
    if (isNew) {
      response.cookies.set(COOKIE_NAME, sessionId, {
        httpOnly: true,
        maxAge: COOKIE_MAX_AGE,
        sameSite: "lax",
        path: "/",
      });
    }

    return response;
  } catch (err) {
    console.error("[history] POST error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "unavailable" }, { status: 200 });
  }
}

// ---------------------------------------------------------------------------
// DELETE — clear all sessions for the user
// ---------------------------------------------------------------------------
export async function DELETE() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(COOKIE_NAME)?.value;
    if (!sessionId) return NextResponse.json({ ok: true });

    const client = getClient();

    // Query all sessions for this user then delete each
    const result = await client.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "sessionId = :sid",
        ExpressionAttributeValues: { ":sid": sessionId },
        ProjectionExpression: "sessionId, createdAt",
      })
    );

    for (const item of result.Items ?? []) {
      await client.send(
        new DeleteCommand({
          TableName: TABLE,
          Key: { sessionId: item.sessionId, createdAt: item.createdAt },
        })
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[history] DELETE error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "unavailable" }, { status: 200 });
  }
}
