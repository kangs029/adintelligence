/**
 * POST /api/community/draft
 *
 * Generates a draft Reddit reply for a specific community thread
 * using Claude Sonnet as an XPAT user persona.
 *
 * Request body:
 *   { thread: CommunityThread }
 *
 * Response:
 *   200 { draft: string, kbContextUsed: boolean, intent: string, direction: string }
 *   400 { error: string }  — missing or invalid thread
 *   503 { error: string }  — Bedrock not available
 */

import { hasBedrockCredentials } from "@/lib/ai/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  // Validate credentials
  if (!hasBedrockCredentials()) {
    return Response.json(
      { error: "Draft generation is not available in this environment." },
      { status: 503 },
    );
  }

  let body: { thread?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const thread = body?.thread as Record<string, unknown> | undefined;

  if (!thread || typeof thread.id !== "string" || typeof thread.title !== "string") {
    return Response.json(
      { error: "Request must include a valid thread with id and title." },
      { status: 400 },
    );
  }

  // Only allow drafts for classified threads with sufficient relevance
  if (
    typeof thread.relevanceScore === "number" &&
    thread.relevanceScore < 0.5
  ) {
    return Response.json(
      { error: "Thread relevance is too low for draft generation." },
      { status: 400 },
    );
  }

  // Dynamically import draft pipeline (Node.js ESM — avoids bundling issues)
  const { generateDraft } = await import(
    "../../../../lib/ai/community-drafter.mjs"
  );

  const result = await generateDraft({ thread });

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  return Response.json(result);
}
