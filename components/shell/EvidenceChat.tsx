"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai";
import type { UIMessage } from "ai";
import { useMemo, useState } from "react";

import { MessageResponse } from "@/components/ai-elements/message";
import { ProvenanceChip } from "@/components/shell/ProvenanceChip";

interface EvidenceChatProps {
  aiEnabled: boolean;
}

const SUGGESTIONS = [
  "Why is Dallas tier 1?",
  "How does Remitly position versus Wise?",
  "What do Xpat app reviews complain about?",
];

type MessagePart = UIMessage["parts"][number];

function toolStateLabel(state: string | undefined): string {
  switch (state) {
    case "output-available":
      return "read";
    case "output-error":
      return "error";
    case "input-streaming":
    case "input-available":
      return "reading";
    default:
      return "step";
  }
}

function renderPart(messageId: string, part: MessagePart, index: number) {
  if (part.type === "text") {
    return part.text ? (
      <MessageResponse key={`${messageId}-text-${index}`}>
        {part.text}
      </MessageResponse>
    ) : null;
  }

  if (isToolUIPart(part)) {
    return (
      <div className="evidence-step" key={`${messageId}-tool-${index}`}>
        <span className="evidence-step-dot" aria-hidden="true" />
        <span className="evidence-step-name">{getToolName(part)}</span>
        <span className="evidence-step-state">{toolStateLabel(part.state)}</span>
      </div>
    );
  }

  return null;
}

export function EvidenceChat({ aiEnabled }: EvidenceChatProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/evidence" }),
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
        aria-controls="evidence-drawer"
        aria-expanded={open}
        className="evidence-trigger"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        Ask the evidence
      </button>

      {open ? (
        <aside
          aria-label="Ask the evidence"
          className="evidence-drawer"
          id="evidence-drawer"
        >
          <header className="evidence-head">
            <div>
              <h2 className="evidence-title">Ask the evidence</h2>
              <p className="evidence-sub">
                Answers cite committed public-data artifacts. Outcome economics
                stay connector-needed.
              </p>
            </div>
            <button
              aria-label="Close evidence drawer"
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
                  Ask about markets, competitor positioning, review themes, or
                  USD to INR FX.
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
                  {message.role === "user" ? "You" : "Evidence"}
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
                Consulting evidence
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
                aria-label="Ask about the evidence"
                className="evidence-input"
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about the evidence..."
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
                committed evidence pages directly.
              </span>
            </div>
          )}
        </aside>
      ) : null}
    </>
  );
}
