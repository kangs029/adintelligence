"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useMemo, useState } from "react";

import { MessageResponse } from "@/components/ai-elements/message";
import { ProvenanceChip } from "@/components/shell/ProvenanceChip";
import type { DemoBrief } from "@/lib/data/market-briefs";

interface MarketBriefProps {
  marketId: string;
  marketName: string;
  demoBrief: DemoBrief | null;
  demoModel: string;
  aiEnabled: boolean;
}

function chipModelLabel(model: string): string {
  return model.split("/").at(-1) ?? model;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

export function MarketBrief({
  marketId,
  marketName,
  demoBrief,
  demoModel,
  aiEnabled,
}: MarketBriefProps) {
  if (demoBrief) {
    return (
      <DemoBriefView brief={demoBrief} model={demoModel} />
    );
  }

  if (!aiEnabled) {
    return <ConnectorNeededView />;
  }

  return (
    <LiveBriefView marketId={marketId} marketName={marketName} model={demoModel} />
  );
}

function BriefShell({
  chip,
  children,
  note,
}: {
  chip: React.ReactNode;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <section className="market-brief" aria-label="AI market brief">
      <header className="market-brief-head">
        <h3 className="market-brief-title">AI market brief</h3>
        {chip}
      </header>
      {note ? <p className="market-brief-note">{note}</p> : null}
      <div className="market-brief-body">{children}</div>
    </section>
  );
}

function DemoBriefView({ brief, model }: { brief: DemoBrief; model: string }) {
  return (
    <BriefShell
      chip={<ProvenanceChip provenance="generated" model={chipModelLabel(model)} />}
      note={`Committed demo brief, generated ${formatDate(brief.generatedAt)}. Grounded in public-data facts. Every claim is a hypothesis, not proven performance.`}
    >
      <MessageResponse>{brief.text}</MessageResponse>
    </BriefShell>
  );
}

function ConnectorNeededView() {
  return (
    <BriefShell
      chip={<ProvenanceChip provenance="connector-needed" />}
      note="A live brief for this market is connector-needed. AI Gateway credentials are not configured in this environment. The four demo markets render committed briefs offline."
    >
      <p className="market-brief-empty">
        Pick one of the demo markets to see a committed brief, or configure AI
        Gateway credentials to generate live briefs for any covered market.
      </p>
    </BriefShell>
  );
}

function LiveBriefView({
  marketId,
  marketName,
  model,
}: {
  marketId: string;
  marketName: string;
  model: string;
}) {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/playbook/brief" }),
    [],
  );
  const { messages, sendMessage, status } = useChat({ transport });
  const [started, setStarted] = useState(false);

  const isBusy = status === "submitted" || status === "streaming";

  const assistantText = useMemo(() => {
    const assistant = [...messages].reverse().find((message) => message.role === "assistant");
    if (!assistant) {
      return "";
    }
    return assistant.parts
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("");
  }, [messages]);

  function generate() {
    setStarted(true);
    void sendMessage(
      { text: `Generate the market brief for ${marketName}.` },
      { body: { marketId } },
    );
  }

  return (
    <BriefShell
      chip={
        started ? (
          <ProvenanceChip provenance="generated" model={chipModelLabel(model)} />
        ) : (
          <ProvenanceChip provenance="connector-needed" />
        )
      }
      note="Live brief, grounded in this market's public-data facts and sanitized against the claim contract. Every claim is a hypothesis, not proven performance."
    >
      {!started ? (
        <button type="button" className="market-brief-generate" onClick={generate}>
          Generate market brief
        </button>
      ) : null}

      {assistantText ? <MessageResponse>{assistantText}</MessageResponse> : null}

      {isBusy && !assistantText ? (
        <p className="market-brief-status" aria-live="polite">
          Grounding brief<span className="market-brief-cursor" aria-hidden="true">▍</span>
        </p>
      ) : null}
    </BriefShell>
  );
}
