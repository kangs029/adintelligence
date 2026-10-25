import {
  createAgentUIStreamResponse,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";

import { hasAiCredentials } from "@/lib/ai/config";
import { adAnalystAgent } from "@/lib/ai/ad-analyst-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONNECTOR_NEEDED_TEXT = [
  "The ad analyst is not available in this environment.",
  "",
  "Contact the platform administrator to enable AI access.",
].join("\n");

function staticConnectorNeeded(): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = "ad-analyst-static";
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

  // Debug: log available credential env vars at request time
  console.log("[ad-analyst] env check:", {
    hasBEDROCK_ACCESS_KEY_ID: !!process.env.BEDROCK_ACCESS_KEY_ID,
    hasBEDROCK_SECRET: !!process.env.BEDROCK_SECRET_ACCESS_KEY,
    hasAWS_KEY: !!process.env.AWS_ACCESS_KEY_ID,
    hasBEDROCK_MODEL: !!process.env.BEDROCK_MODEL_ID,
    hasNORMALIZED: !!process.env.NORMALIZED_BUCKET_NAME,
    hasAiCreds: hasAiCredentials(),
    hasMETABASE_URL: !!process.env.METABASE_URL,
    hasMETABASE_KEY: !!process.env.METABASE_API_KEY,
  });

  if (!hasAiCredentials()) {
    return staticConnectorNeeded();
  }

  return createAgentUIStreamResponse({
    agent: adAnalystAgent,
    uiMessages: messages,
    onError: () =>
      "The ad analyst could not answer right now. Try again in a moment, or check the ad performance artifact directly.",
  });
}
