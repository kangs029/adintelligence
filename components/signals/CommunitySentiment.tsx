"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { ProvenanceChip } from "@/components/shell/ProvenanceChip";
import { SourceLink } from "@/components/shell/SourceLink";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SentimentContext = {
  id: string;
  label: string;
  summary: string;
  threadIds: string[];
};

type EvidenceThread = {
  id: string;
  title: string;
  subreddit: string;
  publishedAt?: string | null;
  url: string;
  score: number;
  numComments: number;
};

type WindowData = {
  counts: { positive: number; negative: number; neutral: number; total: number };
  contexts: { positive: SentimentContext[]; negative: SentimentContext[] };
};

type CompanyWindow = {
  overall: WindowData;
  byCompany: Record<string, WindowData>;
};

export type CommunitySentimentArtifact = {
  meta: {
    generatedAt: string;
    provenance: string;
    source: string;
    companies?: string[];
    timeWindows?: string[];
    version?: number;
  };
  data:
    // v2 — per-company, per-time-window
    | Record<string, CompanyWindow>
    // v1 legacy — single window with overall only
    | { counts: WindowData["counts"]; contexts: WindowData["contexts"] };
};

interface CommunitySentimentProps {
  artifact: CommunitySentimentArtifact;
  threads: EvidenceThread[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INITIAL_VISIBLE = 3;
const TIME_WINDOW_LABELS: Record<string, string> = {
  "3months": "Last 3 months",
  "1year": "Last year",
  "all": "All time",
};

function formatDate(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function isV2(data: CommunitySentimentArtifact["data"]): data is Record<string, CompanyWindow> {
  return "all" in data || "1year" in data || "3months" in data;
}

function getWindowData(artifact: CommunitySentimentArtifact, window: string, company: string): WindowData {
  const data = artifact.data;
  if (!isV2(data)) {
    // v1 legacy — return as-is ignoring window/company
    return { counts: data.counts, contexts: data.contexts };
  }
  const windowData = data[window] ?? data["all"];
  if (!windowData) return { counts: { positive: 0, negative: 0, neutral: 0, total: 0 }, contexts: { positive: [], negative: [] } };
  return windowData.byCompany[company] ?? windowData.overall;
}

// ---------------------------------------------------------------------------
// Evidence side panel
// ---------------------------------------------------------------------------

function EvidencePanel({
  context,
  threads,
  sentiment,
  onClose,
}: {
  context: SentimentContext;
  threads: EvidenceThread[];
  sentiment: "positive" | "negative";
  onClose: () => void;
}) {
  const supporting = threads.filter((t) => context.threadIds.includes(t.id));
  const isNegative = sentiment === "negative";

  return (
    <div className="sentiment-evidence-overlay" role="dialog" aria-modal="true" aria-label={`Evidence for ${context.label}`}>
      <div className="sentiment-evidence-panel">
        <div className="sentiment-evidence-header">
          <div>
            <span className={`sentiment-badge ${isNegative ? "sentiment-badge-negative" : "sentiment-badge-positive"}`}>
              {isNegative ? "↓ negative" : "↑ positive"}
            </span>
            <h3>{context.label}</h3>
            <p className="sentiment-evidence-summary">{context.summary}</p>
          </div>
          <button type="button" className="sentiment-evidence-close" onClick={onClose} aria-label="Close evidence panel">
            <X size={16} />
          </button>
        </div>
        <div className="sentiment-evidence-count">
          {supporting.length} supporting {supporting.length === 1 ? "thread" : "threads"} · Reddit
        </div>
        <div className="sentiment-evidence-list">
          {supporting.length === 0 ? (
            <p className="sentiment-evidence-empty">No matching threads found in current dataset.</p>
          ) : (
            supporting.map((thread) => (
              <article key={thread.id} className="sentiment-evidence-card">
                <a href={thread.url} target="_blank" rel="noreferrer" className="sentiment-evidence-title">
                  {thread.title}
                </a>
                <div className="sentiment-evidence-meta">
                  <span>r/{thread.subreddit}</span>
                  {thread.publishedAt && <span>{formatDate(thread.publishedAt)}</span>}
                  <span>{thread.score} score · {thread.numComments} comments</span>
                </div>
                <SourceLink href={thread.url}>view thread</SourceLink>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context card column
// ---------------------------------------------------------------------------

function ContextColumn({
  sentiment,
  contexts,
  threads,
  company,
}: {
  sentiment: "positive" | "negative";
  contexts: SentimentContext[];
  threads: EvidenceThread[];
  company: string;
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [activeContext, setActiveContext] = useState<SentimentContext | null>(null);

  const isNegative = sentiment === "negative";
  const label = isNegative ? "Negative" : "Positive";
  const visible = contexts.slice(0, visibleCount);
  const hasMore = visibleCount < contexts.length;
  const remaining = contexts.length - visibleCount;

  const emptyMsg = isNegative
    ? `No negative themes found about ${company} in this period.`
    : `No positive themes found about ${company} in this period.`;

  if (contexts.length === 0) {
    return (
      <div className="sentiment-column">
        <div className="sentiment-column-head">
          <span className={`sentiment-column-label ${isNegative ? "sentiment-column-label-negative" : "sentiment-column-label-positive"}`}>
            {isNegative ? "↓" : "↑"} {label}
          </span>
        </div>
        <p className="sentiment-empty">{emptyMsg}</p>
      </div>
    );
  }

  return (
    <div className="sentiment-column">
      <div className="sentiment-column-head">
        <span className={`sentiment-column-label ${isNegative ? "sentiment-column-label-negative" : "sentiment-column-label-positive"}`}>
          {isNegative ? "↓" : "↑"} {label}
        </span>
        <span className="sentiment-column-count">{contexts.length} themes</span>
      </div>

      <div className="sentiment-context-list">
        {visible.map((ctx) => (
          <article key={ctx.id} className="sentiment-context-card">
            <h4 className="sentiment-context-label">{ctx.label}</h4>
            <p className="sentiment-context-summary">{ctx.summary}</p>
            <div className="sentiment-context-footer">
              <span className="sentiment-context-posts">
                {ctx.threadIds.length} {ctx.threadIds.length === 1 ? "post" : "posts"}
              </span>
              <button type="button" className="action-link" onClick={() => setActiveContext(ctx)}>
                Evidence →
              </button>
            </div>
          </article>
        ))}
      </div>

      {hasMore && (
        <button type="button" className="thread-show-more-btn" onClick={() => setVisibleCount((prev) => prev + INITIAL_VISIBLE)}>
          Show {Math.min(remaining, INITIAL_VISIBLE)} more
          <span className="thread-show-more-total">({remaining} remaining)</span>
        </button>
      )}

      {activeContext && (
        <EvidencePanel
          context={activeContext}
          threads={threads}
          sentiment={sentiment}
          onClose={() => setActiveContext(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CommunitySentiment({ artifact, threads }: CommunitySentimentProps) {
  const companies = artifact.meta.companies ?? ["XPAT"];
  const timeWindows = artifact.meta.timeWindows ?? ["all"];
  const isV2Artifact = isV2(artifact.data);

  const [selectedCompany, setSelectedCompany] = useState(
    companies.includes("XPAT") ? "XPAT" : (companies[0] ?? "XPAT")
  );
  const [selectedWindow, setSelectedWindow] = useState(timeWindows.includes("all") ? "all" : timeWindows[0]);

  const windowData = getWindowData(artifact, selectedWindow, selectedCompany);
  const { counts, contexts } = windowData;

  // Sentiment bar only shown for XPAT (our product) — for competitors we show
  // breakdown themes only so the bar doesn't mislead about market positioning
  const isXpat = selectedCompany === "XPAT";

  const positiveThemes = contexts.positive.length;
  const negativeThemes = contexts.negative.length;
  const themeTotal = positiveThemes + negativeThemes;
  const positivePct = themeTotal > 0 ? Math.round((positiveThemes / themeTotal) * 100) : 0;
  const negativePct = themeTotal > 0 ? 100 - positivePct : 0;

  const subtitle = `What the community is saying about ${selectedCompany} — based on Reddit discussions.`;

  return (
    <section className="evidence-section" aria-labelledby="community-sentiment-title">
      <div className="cardhead">
        <div>
          <h2 id="community-sentiment-title">Community sentiment</h2>
          <p className="section-subtitle">{subtitle}</p>
        </div>
        <ProvenanceChip date={formatDate(artifact.meta.generatedAt)} provenance="derived" />
      </div>

      {/* Filters — company + time window */}
      {isV2Artifact && (
        <div className="sentiment-filters">
          <label>
            Company
            <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}>
              {companies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Period
            <select value={selectedWindow} onChange={(e) => setSelectedWindow(e.target.value)}>
              {timeWindows.map((w) => (
                <option key={w} value={w}>{TIME_WINDOW_LABELS[w] ?? w}</option>
              ))}
            </select>
          </label>
          <span className="sentiment-filter-count">
            {counts.total} posts · {counts.negative} negative · {counts.positive} positive
          </span>
        </div>
      )}

      {/* Sentiment bar — only for XPAT */}
      {isXpat && (
        themeTotal > 0 ? (
          <div className="sentiment-bar-wrap">
            <div className="sentiment-bar" role="img" aria-label={`${positivePct}% positive, ${negativePct}% negative`}>
              <div className="sentiment-bar-segment sentiment-bar-positive" style={{ width: `${positivePct}%`, minWidth: positivePct > 0 ? "4px" : "0" }} />
              <div className="sentiment-bar-segment sentiment-bar-negative" style={{ width: `${negativePct}%`, minWidth: negativePct > 0 ? "4px" : "0" }} />
            </div>
            <div className="sentiment-bar-legend">
              <span className="sentiment-legend-item">
                <span className="sentiment-legend-dot sentiment-legend-positive" />
                <span className="sentiment-pct-positive">{positivePct}%</span>{" "}positive
              </span>
              <span className="sentiment-legend-item">
                <span className="sentiment-legend-dot sentiment-legend-negative" />
                <span className="sentiment-pct-negative">{negativePct}%</span>{" "}negative
              </span>
            </div>
          </div>
        ) : (
          <p className="sentiment-empty" style={{ marginBottom: "16px" }}>
            Not enough data for {selectedCompany} in this period.
          </p>
        )
      )}

      {/* Context columns */}
      <div className="sentiment-columns">
        <ContextColumn sentiment="positive" contexts={contexts.positive} threads={threads} company={selectedCompany} />
        <ContextColumn sentiment="negative" contexts={contexts.negative} threads={threads} company={selectedCompany} />
      </div>
    </section>
  );
}
