import {
  createAgentUIStreamResponse,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";

import { hasAiCredentials } from "@/lib/ai/config";
import { evidenceAgent } from "@/lib/ai/evidence-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONNECTOR_NEEDED_TEXT = [
  "## Connector needed",
  "",
  "The evidence assistant needs AI Gateway credentials, which are not configured in this environment.",
  "",
  "You can still browse the committed evidence directly across Market Map, Competitors, Signals, and Playbook. Outcome measurement stays connector-needed until Xpat exports its schema.",
].join("\n");

/**
 * Emits a single markdown message through the UI message stream protocol with
 * no model call, so the client `useChat` UI renders cleanly when credentials
 * are absent.
 */
function staticConnectorNeeded(): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = "evidence-static";
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: CONNECTOR_NEEDED_TEXT });
      writer.write({ type: "text-end", id });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { messages?: unknown[] };
  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (!hasAiCredentials()) {
    return staticConnectorNeeded();
  }

  return createAgentUIStreamResponse({
    agent: evidenceAgent,
    uiMessages: messages,
    onError: () =>
      "The evidence assistant could not answer right now. Try again in a moment, or browse the committed evidence pages directly.",
  });
}
