import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type TextStreamPart,
  type ToolSet,
} from "ai";

import { buildBriefGrounding, computeSourceHash } from "@/lib/ai/brief-grounding";
import { setCachedBrief } from "@/lib/ai/brief-cache";
import { BRIEF_MODEL, hasAiCredentials } from "@/lib/ai/config";
import { buildBriefSystemPrompt, buildBriefUserPrompt } from "@/lib/ai/brief-prompt";
import { createLineSanitizer, sanitizeBrief } from "@/lib/ai/brief-sanitizer";
import { buildDossierForGeoid } from "@/lib/playbook/dossier-inputs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONNECTOR_NEEDED_TEXT = [
  "## Connector needed",
  "",
  "A live market brief for this market is connector-needed. It requires AI Gateway credentials that are not configured in this environment.",
  "",
  "The four demo markets render committed, pre-generated briefs without any live call. Outcome measurement stays connector-needed until Xpat exports its schema.",
].join("\n");

/**
 * Emits a single sanitized markdown message through the UI message stream
 * protocol, without any model call. Used for the zero-credential and
 * unknown-market safety nets so the client `useChat` UI still renders cleanly.
 */
function staticMessageResponse(text: string): Response {
  const safe = sanitizeBrief(text).text;
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = "brief-static";
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: safe });
      writer.write({ type: "text-end", id });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

/**
 * Line-buffering sanitizing transform for the live stream. It holds partial
 * lines until a newline, sanitizes each complete line against the claim
 * contract, and flushes the remaining buffer right before the text run ends, so
 * no unsanitized token can ever reach the client mid-stream.
 */
function sanitizingTransform() {
  return () => {
    const sanitizer = createLineSanitizer();
    let lastTextId: string | undefined;

    return new TransformStream<TextStreamPart<ToolSet>, TextStreamPart<ToolSet>>({
      transform(chunk, controller) {
        if (chunk.type === "text-delta") {
          lastTextId = chunk.id;
          const emitted = sanitizer.push(chunk.text);
          if (emitted) {
            controller.enqueue({ ...chunk, text: emitted });
          }
          return;
        }

        if (chunk.type === "text-end") {
          const tail = sanitizer.flush();
          if (tail && lastTextId !== undefined) {
            controller.enqueue({ type: "text-delta", id: lastTextId, text: tail });
          }
          controller.enqueue(chunk);
          return;
        }

        controller.enqueue(chunk);
      },
    });
  };
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { marketId?: unknown };
  const marketId = typeof body.marketId === "string" ? body.marketId : undefined;

  const dossier = buildDossierForGeoid(marketId);
  if (!dossier || !marketId) {
    return staticMessageResponse(
      "## Market not available\n\nThis market is not covered for a grounded brief yet. Pick a covered market to generate one. Outcome measurement stays connector-needed until Xpat exports its schema.",
    );
  }

  if (!hasAiCredentials()) {
    return staticMessageResponse(CONNECTOR_NEEDED_TEXT);
  }

  const facts = buildBriefGrounding(dossier);
  const sourceHash = computeSourceHash(facts);
  const marketName = dossier.market.name;

  const result = streamText({
    model: BRIEF_MODEL,
    system: buildBriefSystemPrompt(),
    prompt: buildBriefUserPrompt(marketName, facts),
    experimental_transform: sanitizingTransform(),
    onFinish: ({ text }) => {
      // `text` is already sanitized (the transform runs upstream); re-run once
      // as a defensive backstop before caching.
      const sanitized = sanitizeBrief(text);
      setCachedBrief(marketId, {
        text: sanitized.text,
        model: BRIEF_MODEL,
        generatedAt: new Date().toISOString(),
        sourceHash,
      });
    },
  });

  return result.toUIMessageStreamResponse({
    onError: () =>
      "The live brief could not be generated right now. Pick one of the four demo markets for a committed brief, or try again in a moment. Outcome measurement stays connector-needed until Xpat exports its schema.",
  });
}
