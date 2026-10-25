"use client";

import { useMemo, useState } from "react";
import { MessageSquare, Plug } from "lucide-react";
import { ProvenanceChip, type Provenance } from "@/components/shell/ProvenanceChip";
import { SourceLink } from "@/components/shell/SourceLink";
export type CommunityThread = {
  action?: string;
  body?: string;
  capturedAt: string;
  id: string;
  matchedQueries: string[];
  numComments: number;
  pain?: string;
  platform?: string;
  priority?: string;
  publishedAt?: string | null;
  publishedAtPrecision?: string;
  recency: "recent" | "historical";
  responseAngle?: string;
  score: number;
  sensitivity?: string;
  sourceAgeLabel?: string;
  sourceCheckedAt?: string;
  sourceFreshness?: string;
  subreddit: string;
  themes: string[];
  title: string;
  url: string;
  // Step 2 — Classification fields (added by classify.mjs)
  classifiedAt?: string;
  classifyError?: string;
  competitorMentions?: string[];
  direction?: "outbound" | "inbound" | "both" | "unclear";
  intent?: "remittance_comparison" | "pricing_pain" | "speed_concern" | "trust_issue" | "new_to_us" | "community_recommendation" | "competitor_complaint" | "other";
  isRelevant?: boolean;
  language?: string;
  relevanceScore?: number;
  sentiment?: "positive" | "neutral" | "negative";
  urgency?: "high" | "medium" | "low";
  useCase?: string;
};

type MonitorQueue = {
  action: string;
  capturedAt: string;
  link: string;
  platform: string;
  priority: string;
  reason: string;
  responseAngle: string;
  sourceAgeLabel: string;
  title: string;
};

export type CommunityThreadsArtifact = {
  data: {
    classifiedCount?: number;
    classifyErrors?: number;
    connectorNote?: { label: string; status: "connector-needed" };
    draftReadyCount?: number;
    historicalCount: number;
    monitorQueues?: MonitorQueue[];
    queries?: { query: string; subreddits: string[] }[];
    recentCount: number;
    status: "ok" | "blocked" | "connector-needed";
    sweepErrors: { message: string; status?: number }[];
    threads: CommunityThread[];
  };
  meta: {
    classifiedAt?: string;
    generatedAt: string;
    provenance: Provenance;
  };
};

interface CommunityThreadsProps {
  artifact: CommunityThreadsArtifact;
}

const all = "All";
const redditClientId = ["REDDIT", "CLIENT", "ID"].join("_");
const redditClientSecret = ["REDDIT", "CLIENT", "SECRET"].join("_");

function formatDate(value?: string | null) {
  if (!value) return "undated";
  return value.slice(0, 10);
}

function unique(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function threadMentionsCompetitor(thread: CommunityThread, competitor: string) {
  if (competitor === all) return true;

  const haystack = `${thread.title} ${thread.pain ?? ""} ${thread.responseAngle ?? ""} ${thread.matchedQueries.join(" ")}`.toLowerCase();
  return haystack.includes(competitor.toLowerCase());
}

// ---------------------------------------------------------------------------
// Xpat relevance criteria — hard boolean filter
// Posts must match at least one category. Replaces AI relevanceScore gating.
// ---------------------------------------------------------------------------

const XPAT_CORRIDOR = [
  /send.{0,25}money.{0,25}india/i, /india.{0,25}send.{0,25}money/i,
  /transfer.{0,25}(india|inr|rupee)/i,
  /remit(tance)?.{0,25}india/i, /india.{0,25}remit(tance)?/i,
  /usd.{0,20}(to.{0,5})?inr/i, /inr.{0,20}(to.{0,5})?usd/i,
  /money.{0,20}(india|inr)/i, /india.{0,20}money/i,
  /\b(us|usa|united states|america).{0,30}india.{0,30}(money|transfer|send|remit)/i,
  /india.{0,30}(us|usa|united states|america).{0,30}(money|transfer|send|remit)/i,
  /wire.{0,20}india/i, /forex.{0,20}india/i,
  /exchange rate.{0,20}india/i, /india.{0,20}exchange rate/i,
];

const XPAT_BANKING = [
  /\bnre\b.{0,40}(transfer|account|usa|us\b|send|remit)/i,
  /\bnro\b.{0,40}(transfer|account|usa|us\b|send|remit)/i,
  /\bfcnr\b.{0,40}(transfer|send|remit|wire|move money)/i,
  /(transfer|send|remit|wire).{0,40}\bfcnr\b/i,
  /(transfer|send|remit).{0,40}\bnre\b/i,
  /(transfer|send|remit).{0,40}\bnro\b/i,
];

const XPAT_COMPETITORS = [
  /\bwise\b.{0,50}india/i, /india.{0,50}\bwise\b/i,
  /\bremitly\b/i, /\bxoom\b/i, /\btaptap\b/i, /\binstarem\b/i,
  /\babound\b/i, /\baspora\b/i, /\bremit2any\b/i, /\bunplex\b/i,
  /western union.{0,30}india/i, /india.{0,30}western union/i,
];

const XPAT_PAIN = [
  /transfer.{0,20}(fail|stuck|delay|pending|missing)/i,
  /(fail|stuck|delay|pending|missing).{0,20}transfer/i,
  /send money.{0,20}(parents|family)/i, /(parents|family).{0,20}send money/i,
  /best.{0,20}(app|way|service|platform).{0,20}(send|remit|transfer).{0,20}india/i,
  /cheapest.{0,30}india/i,
  /fees.{0,20}(remit|transfer|send).{0,20}india/i,
  /how.{0,20}(send|transfer).{0,20}money.{0,20}india/i,
  /upi.{0,20}india.{0,20}(usa|us\b)/i,
];

const XPAT_CONTEXT = [
  /nri.{0,30}(send|transfer|remit|money|fund)/i,
  /(send|transfer|remit|money|fund).{0,30}nri/i,
  /h1b.{0,30}(send|transfer|remit|money|india)/i,
  /401k.{0,30}india/i, /india.{0,30}401k/i,
  /us.{0,10}india.{0,10}remittance/i,
  /remittance.{0,20}(us|usa|h1b|nri)/i,
];

const XPAT_EXCLUDE = [
  /h1b.{0,30}(transfer|stamp|petition|lottery|extension|cos|uscis|approval|denial)/i,
  /visa.{0,20}(stamp|interview|petition|approve|deni)/i,
  /oci\b(?!.{0,30}(money|transfer|remit|send|fund))/i,
  /passport.{0,20}(renew|expire|lost|appoint)/i,
  /\b(cricket|ipl|bollywood|movie|film|music)\b/i,
  /\b(election|bjp|congress|modi|politics|vote)\b/i,
  /india.{0,20}(uk|canada|australia|uae|gulf|dubai|singapore|germany).{0,20}(transfer|remit|send)/i,
  // Physical shipping / documents — not money transfer
  /send(ing)?.{0,20}(documents?|papers?|parcels?|packages?|mail)/i,
  /\b(fedex|ups|dhl|usps|parcel monkey|pirate ship|shiprocket)\b/i,
  /notariz(ed|ation)|power of attorney/i,
  // Deposit conversion timing / account mechanics — not a transfer decision
  /when to convert.{0,30}(nre|nro|fcnr|deposit)/i,
  /convert.{0,20}(nre|nro|fcnr).{0,20}(deposit|after return)/i,
  // Bank account selection — not remittance
  /best.{0,20}(us|usa)?\s*(bank|checking|savings)\s*account/i,
  /which.{0,20}(bank|account).{0,20}(returnee|return to india|rnor)/i,
];

function isXpatRelevant(thread: CommunityThread): boolean {
  // If classified by Haiku, use its isRelevant judgment
  if (thread.classifiedAt) {
    return thread.isRelevant === true;
  }
  // Fallback for unclassified threads — use regex patterns
  const text = `${thread.title} ${thread.body ?? ""}`;
  if (XPAT_EXCLUDE.some((p) => p.test(text))) return false;
  return (
    XPAT_CORRIDOR.some((p) => p.test(text)) ||
    XPAT_BANKING.some((p) => p.test(text)) ||
    XPAT_COMPETITORS.some((p) => p.test(text)) ||
    XPAT_PAIN.some((p) => p.test(text)) ||
    XPAT_CONTEXT.some((p) => p.test(text))
  );
}

function filterThreads({
  competitor,
  direction,
  intent,
  relevance,
  sentiment,
  source,
  threads,
}: {
  competitor: string;
  direction: string;
  intent: string;
  relevance: string;
  sentiment: string;
  source: string;
  threads: CommunityThread[];
}) {
  const INTENT_CODE: Record<string, string> = {
    "Comparing services": "remittance_comparison",
    "Fee complaint": "pricing_pain",
    "Speed issue": "speed_concern",
    "Trust / security concern": "trust_issue",
    "First-time sender": "new_to_us",
    "Asking for recommendation": "community_recommendation",
    "Competitor issue": "competitor_complaint",
  };

  return threads.filter((thread) => {
    // Apply Xpat relevance gate first
    if (!isXpatRelevant(thread)) return false;

    const score = typeof thread.relevanceScore === "number" ? thread.relevanceScore : undefined;

    const intentMatch = intent === all || thread.intent === INTENT_CODE[intent];
    const competitorMatch = competitor === all || threadMentionsCompetitor(thread, competitor);
    const sourceMatch = source === all || source === "Reddit";
    const directionMatch =
      direction === all ||
      (direction === "US → India" && thread.direction === "outbound") ||
      (direction === "India → US" && thread.direction === "inbound") ||
      (direction === "Both" && thread.direction === "both");
    const sentimentMatch = sentiment === all || thread.sentiment === sentiment.toLowerCase();
    const relevanceMatch =
      relevance === all ||
      (relevance === "Respond" && score !== undefined && score >= 0.7) ||
      (relevance === "Watch" && score !== undefined && score >= 0.4 && score < 0.7);

    return intentMatch && competitorMatch && sourceMatch && directionMatch && sentimentMatch && relevanceMatch;
  });
}

function readableRedditError(message: string) {
  return message
    .replaceAll(`${redditClientId} and ${redditClientSecret}`, "Reddit API access")
    .replaceAll(redditClientId, "Reddit client id")
    .replaceAll(redditClientSecret, "Reddit client secret");
}

// Human-readable labels for intent codes
const INTENT_LABELS: Record<string, string> = {
  remittance_comparison: "Comparing services",
  pricing_pain: "Fee complaint",
  speed_concern: "Speed issue",
  trust_issue: "Trust / security concern",
  new_to_us: "First-time sender",
  community_recommendation: "Asking for recommendation",
  competitor_complaint: "Competitor issue",
  other: "General discussion",
};

// Human-readable labels for use case codes
const USE_CASE_LABELS: Record<string, string> = {
  first_transfer: "First transfer",
  repeat: "Repeat sender",
  kyc: "KYC / verification",
  rate_shopping: "Rate shopping",
  other: "",
};

// Human-readable labels for direction codes
const DIRECTION_LABELS: Record<string, string> = {
  outbound: "US → India",
  inbound: "India → US",
  both: "Both directions",
  unclear: "",
};

function ThreadCard({ thread }: { thread: CommunityThread }) {
  const scoreText =
    thread.score > 0 || thread.numComments > 0
      ? `${thread.score.toLocaleString("en-US")} score · ${thread.numComments.toLocaleString("en-US")} comments`
      : `${thread.priority ?? "review"} priority · ${thread.action ?? "monitor"}`;
  const publishedPrefix = !thread.publishedAt
    ? "publishedAt"
    : thread.publishedAtPrecision?.startsWith("approx")
      ? "publishedAt approx"
      : "publishedAt";
  const publishedText = thread.publishedAt ? formatDate(thread.publishedAt) : "undated historical";

  const isClassified = Boolean(thread.classifiedAt);
  const relevancePct = isClassified && typeof thread.relevanceScore === "number"
    ? Math.round(thread.relevanceScore * 100)
    : null;
  const isDraftReady =
    thread.isRelevant === true ||
    (typeof thread.relevanceScore === "number" && thread.relevanceScore >= 0.7) ||
    isXpatRelevant(thread);

  // Build all classification pills in one unified tag row
  const classifyTags: string[] = [];
  if (isClassified) {
    // Relevance action
    if (relevancePct !== null) {
      classifyTags.push(isDraftReady ? "Respond" : "Watch");
    }
    // Sentiment — only positive/negative, neutral is not actionable
    if (thread.sentiment && thread.sentiment !== "neutral") {
      const icon = thread.sentiment === "positive" ? "↑" : "↓";
      classifyTags.push(`${icon} ${thread.sentiment}`);
    }
    // Intent
    if (thread.intent && thread.intent !== "other") {
      classifyTags.push(INTENT_LABELS[thread.intent] ?? thread.intent);
    }
    // Direction
    if (thread.direction && thread.direction !== "unclear") {
      classifyTags.push(DIRECTION_LABELS[thread.direction] ?? thread.direction);
    }
    // Use case
    if (thread.useCase && thread.useCase !== "other") {
      const label = USE_CASE_LABELS[thread.useCase];
      if (label) classifyTags.push(label);
    }
    // Competitors
    if (thread.competitorMentions && thread.competitorMentions.length > 0) {
      classifyTags.push(`vs ${thread.competitorMentions.join(", ")}`);
    }
  }

  // Navigate to draft page — store thread in sessionStorage first
  

  return (
    <article className="thread-card">
      <div className="thread-card-top">
        <a href={thread.url} rel="noreferrer" target="_blank">
          {thread.title}
        </a>
        <span>r/{thread.subreddit}</span>
      </div>
      <div className="thread-dates">
        <span>{publishedPrefix} {publishedText}</span>
        <span>capturedAt {formatDate(thread.capturedAt)}</span>
        {thread.sourceAgeLabel ? <span>{thread.sourceAgeLabel}</span> : null}
      </div>
      <div className="thread-score-row">
        <span>{scoreText}</span>
      </div>

      {thread.pain ? <p className="thread-pain">{thread.pain}</p> : null}
      {thread.responseAngle ? <p className="response-angle">{thread.responseAngle}</p> : null}

      {classifyTags.length > 0 ? (
        <div className="tag-row">
          {classifyTags.map((tag) => (
            <span className="tag-pill" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="signal-action-row">
        <SourceLink href={thread.url}>thread source</SourceLink>
        {isDraftReady ? (
          <a
            href={`/signals/draft?id=${thread.id}`}
            target="_blank"
            rel="noreferrer"
            className="action-link draft-btn"
            onClick={() => {
              try {
                sessionStorage.setItem(`draft-thread-${thread.id}`, JSON.stringify(thread));
              } catch { /* ignore */ }
            }}
          >
            Draft reply ↗
          </a>
        ) : (
          <a href={thread.url} rel="noreferrer" target="_blank" className="action-link">
            View post ↗
          </a>
        )}
      </div>
    </article>
  );
}

const INITIAL_VISIBLE = 5;

function ThreadColumn({
  accessBlocked,
  title,
  threads,
}: {
  accessBlocked: boolean;
  title: string;
  threads: CommunityThread[];
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  const emptyText = accessBlocked
    ? title === "Recent (60d)"
      ? "Pending Reddit access for recent thread capture."
      : "Pending Reddit access for historical thread capture."
    : title === "Recent (60d)"
      ? "No dated recent threads yet."
      : "No dated historical threads yet.";
  const sortedThreads = [...threads].sort((left, right) => {
    const dateOrder = (right.publishedAt ?? "").localeCompare(left.publishedAt ?? "");
    return dateOrder || left.title.localeCompare(right.title);
  });

  const visibleThreads = sortedThreads.slice(0, visibleCount);
  const hasMore = visibleCount < sortedThreads.length;
  const remaining = sortedThreads.length - visibleCount;

  return (
    <section className="thread-column" aria-label={title}>
      <div className="thread-column-head">
        <h3>{title}</h3>
        <span>{sortedThreads.length.toLocaleString("en-US")}</span>
      </div>
      {sortedThreads.length > 0 ? (
        <>
          <div className="thread-list">
            {visibleThreads.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} />
            ))}
          </div>
          <div className="thread-show-more-row">
            {hasMore ? (
              <button
                type="button"
                className="thread-show-more-btn"
                onClick={() => setVisibleCount((prev) => prev + INITIAL_VISIBLE)}
              >
                Show {Math.min(remaining, INITIAL_VISIBLE)} more
                <span className="thread-show-more-total">({remaining} remaining)</span>
              </button>
            ) : sortedThreads.length > INITIAL_VISIBLE ? (
              <button
                type="button"
                className="thread-show-more-btn"
                onClick={() => setVisibleCount(INITIAL_VISIBLE)}
              >
                Show less
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="thread-empty-card">
          <MessageSquare size={16} aria-hidden="true" />
          <p>{emptyText}</p>
        </div>
      )}
    </section>
  );
}

export function CommunityThreads({ artifact }: CommunityThreadsProps) {
  const threads = artifact.data.threads;
  const [source, setSource] = useState(all);
  const [intent, setIntent] = useState(all);
  const [relevance, setRelevance] = useState(all);
  const [direction, setDirection] = useState(all);
  const [sentiment, setSentiment] = useState(all);
  const [competitor, setCompetitor] = useState(all);

  const subredditOptions = useMemo(
    () => [all, ...unique(threads.map((thread) => thread.subreddit))],
    [threads],
  );
  const intentOptions = [
    all,
    "Comparing services",
    "Fee complaint",
    "Speed issue",
    "Trust / security concern",
    "First-time sender",
    "Asking for recommendation",
    "Competitor issue",
  ];
  const sourceOptions = [all, "Reddit"];
  const relevanceOptions = [all, "Respond", "Watch"];
  const directionOptions = [all, "US → India", "India → US", "Both"];
  const sentimentOptions = [all, "Positive", "Neutral", "Negative"];
  const competitorOptions = [all, "Remitly", "Wise", "Xoom", "Western Union", "Aspora", "Crobo", "Xpat"];

  const filtered = filterThreads({ competitor, direction, intent, relevance, sentiment, source, threads });
  const recent = filtered.filter((thread) => thread.recency === "recent");
  const historical = filtered.filter((thread) => thread.recency === "historical");
  const blocked = artifact.data.status !== "ok";
  const monitorQueues = artifact.data.monitorQueues ?? [];

  const filtersActive =
    source !== all || intent !== all || relevance !== all ||
    direction !== all || sentiment !== all || competitor !== all;
  const noFilterResults = !blocked && filtersActive && filtered.length === 0;
  const activeFilterSummary = [
    source !== all ? `source ${source}` : null,
    intent !== all ? `intent ${intent}` : null,
    relevance !== all ? `relevance ${relevance}` : null,
    direction !== all ? `direction ${direction}` : null,
    sentiment !== all ? `sentiment ${sentiment}` : null,
    competitor !== all ? `competitor ${competitor}` : null,
  ].filter((item): item is string => Boolean(item)).join(", ");

  const resetFilters = () => {
    setSource(all);
    setIntent(all);
    setRelevance(all);
    setDirection(all);
    setSentiment(all);
    setCompetitor(all);
  };

  const classifiedCount = artifact.data.classifiedCount ?? threads.filter((t) => t.classifiedAt).length;
  const draftReadyCount = artifact.data.draftReadyCount ?? threads.filter((t) => typeof t.relevanceScore === "number" && t.relevanceScore >= 0.7).length;
  const watchCount = threads.filter((t) => typeof t.relevanceScore === "number" && t.relevanceScore >= 0.4 && t.relevanceScore < 0.7).length;
  const discardedCount = threads.filter((t) => typeof t.relevanceScore === "number" && t.relevanceScore < 0.4).length;
  const hasClassification = classifiedCount > 0;

  return (
    <section className="evidence-section" aria-labelledby="community-threads-title">
      <div className="cardhead">
        <div>
          <h2 id="community-threads-title">Community threads</h2>
          <p className="section-subtitle">
            Recent and historical buckets use Reddit publishedAt when available.
          </p>
        </div>
        <ProvenanceChip
          date={formatDate(artifact.meta.generatedAt)}
          provenance={artifact.meta.provenance}
        />
      </div>

      <div className="date-semantics-note">
        <MessageSquare size={14} aria-hidden="true" />
        <p>
          publishedAt is Reddit post time. capturedAt is when Xpat OS saw the
          thread. Recent means published within 60 days of capturedAt. Undated
          v1 historical rows stay historical without an invented post date.
        </p>
      </div>

      {blocked ? (
        <div className="connector-state signal-connector">
          <div className="connector-title">
            <Plug size={16} aria-hidden="true" />
            <h3>Needs Reddit API access</h3>
          </div>
          {artifact.data.sweepErrors.map((error) => (
            <p key={error.message}>{readableRedditError(error.message)}</p>
          ))}
          <p className="connector-unlock">
            Unlocks dated community threads, subreddit filters, and competitor
            mention evidence.
          </p>
          <details className="setup-details">
            <summary>setup details</summary>
            <code className="schema-box" data-copy-code>{`${redditClientId}
${redditClientSecret}`}</code>
          </details>
        </div>
      ) : (
        <div className="inline-connector-strip">
          <Plug size={14} aria-hidden="true" />
          <span>{artifact.data.connectorNote?.label ?? "Reddit API access makes this live-refreshable"}</span>
        </div>
      )}

      <div className="thread-filters" aria-label="Community thread filters">
        <label>
          Source
          <select value={source} onChange={(event) => setSource(event.target.value)}>
            {sourceOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Relevance
          <select value={relevance} onChange={(event) => setRelevance(event.target.value)}>
            {relevanceOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Direction
          <select value={direction} onChange={(event) => setDirection(event.target.value)}>
            {directionOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Sentiment
          <select value={sentiment} onChange={(event) => setSentiment(event.target.value)}>
            {sentimentOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Competitor
          <select value={competitor} onChange={(event) => setCompetitor(event.target.value)}>
            {competitorOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Intent
          <select value={intent} onChange={(event) => setIntent(event.target.value)}>
            {intentOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>



      <div className="thread-split-grid">
        {noFilterResults ? (
          <div className="thread-filter-empty" aria-live="polite">
            <MessageSquare size={16} aria-hidden="true" />
            <div>
              <p>No community threads match {activeFilterSummary}.</p>
              <span>Clear filters or choose All to return to the captured thread set.</span>
            </div>
            <button type="button" onClick={resetFilters}>
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <ThreadColumn accessBlocked={blocked} threads={recent} title="Recent (60d)" />
            <ThreadColumn accessBlocked={blocked} threads={historical} title="Historical" />
          </>
        )}
      </div>

      {monitorQueues.length > 0 ? (
        <section className="monitor-queues" aria-label="Monitor queues">
          <div className="thread-column-head">
            <div>
              <h3>Monitor queues</h3>
              <p className="section-subtitle">Saved searches and non-thread surfaces, not counted as threads.</p>
            </div>
            <span>{monitorQueues.length.toLocaleString("en-US")}</span>
          </div>
          <div className="monitor-queue-list">
            {monitorQueues.map((queue) => (
              <article className="monitor-queue-card" key={`${queue.title}-${queue.link}`}>
                <div>
                  <strong>{queue.title}</strong>
                  <p>{queue.reason}</p>
                </div>
                <SourceLink href={queue.link}>monitor source</SourceLink>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
