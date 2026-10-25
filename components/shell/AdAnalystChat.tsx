"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart } from "ai";
import type { UIMessage } from "ai";
import { useMemo, useState } from "react";

import { MessageResponse } from "@/components/ai-elements/message";
import { ProvenanceChip } from "@/components/shell/ProvenanceChip";

interface AdAnalystChatProps {
  aiEnabled: boolean;
}

const SUGGESTIONS = [
  "Which campaign has the lowest cost per click?",
  "Compare Meta and Google Ads performance",
  "Which 5 campaigns had the most impressions?",
];

type MessagePart = UIMessage["parts"][number];

function renderPart(messageId: string, part: MessagePart, index: number) {
  if (part.type === "text") {
    return part.text ? (
      <MessageResponse key={`${messageId}-text-${index}`}>
        {part.text}
      </MessageResponse>
    ) : null;
  }

  if (isToolUIPart(part)) {
    const isWorking =
      part.state === "input-streaming" || part.state === "input-available";
    return isWorking ? (
      <div className="evidence-step" key={`${messageId}-tool-${index}`}>
        <span className="evidence-step-dot" aria-hidden="true" />
        <span className="evidence-step-name">...</span>
      </div>
    ) : null;
  }

  return null;
}

export function AdAnalystChat({ aiEnabled }: AdAnalystChatProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/ad-analyst" }),
    [],
  );
  const { messages, sendMessage, status } = useChat({ transport });

  const isBusy = status === "submitted" || status === "streaming";

  function submit(text: string) {
    const question = text.trim();
    if (!question || isBusy) {
      return;
    }
    setInput("");
    void sendMessage({ text: question });
  }

  return (
    <>
      <button
        aria-controls="ad-analyst-drawer"
        aria-expanded={open}
        className="evidence-trigger"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        Ask the ad analyst
      </button>

      {open ? (
        <aside
          aria-label="Ask the ad analyst"
          className="evidence-drawer"
          id="ad-analyst-drawer"
        >
          <header className="evidence-head">
            <div>
              <h2 className="evidence-title">Ask the ad analyst</h2>
              <p className="evidence-sub">
                Answers cite XPAT Meta and Google Ads campaign data. Verified
                conversions require the attribution webhook.
              </p>
            </div>
            <button
              aria-label="Close ad analyst drawer"
              className="evidence-close"
              onClick={() => setOpen(false)}
              type="button"
            >
              Close
            </button>
          </header>

          <div className="evidence-body">
            {messages.length === 0 ? (
              <div className="evidence-empty">
                <p>
                  Ask about campaign impressions, clicks, CTR, CPC, or
                  platform comparisons.
                </p>
                {aiEnabled ? (
                  <ul className="evidence-suggestions">
                    {SUGGESTIONS.map((suggestion) => (
                      <li key={suggestion}>
                        <button
                          onClick={() => submit(suggestion)}
                          type="button"
                        >
                          {suggestion}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {messages.map((message) => (
              <div
                className={`evidence-message evidence-message-${message.role}`}
                key={message.id}
              >
                <span className="evidence-role">
                  {message.role === "user" ? "You" : "Ad Analyst"}
                </span>
                <div className="evidence-message-body">
                  {message.parts.map((part, index) =>
                    renderPart(message.id, part, index),
                  )}
                </div>
              </div>
            ))}

            {isBusy ? (
              <p aria-live="polite" className="evidence-status">
                Analysing ad data
                <span aria-hidden="true" className="evidence-cursor">
                  {"\u258d"}
                </span>
              </p>
            ) : null}
          </div>

          {aiEnabled ? (
            <form
              className="evidence-form"
              onSubmit={(event) => {
                event.preventDefault();
                submit(input);
              }}
            >
              <input
                aria-label="Ask about ad performance"
                className="evidence-input"
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about ad performance..."
                value={input}
              />
              <button
                className="evidence-send"
                disabled={isBusy || !input.trim()}
                type="submit"
              >
                Ask
              </button>
            </form>
          ) : (
            <div className="evidence-connector">
              <ProvenanceChip provenance="connector-needed" />
              <span>
                AI Gateway credentials are not configured here. Browse the
                committed ad performance data directly.
              </span>
            </div>
          )}
        </aside>
      ) : null}
    </>
  );
}
