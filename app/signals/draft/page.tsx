"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Copy, ExternalLink, ArrowLeft, RefreshCw } from "lucide-react";
import type { CommunityThread } from "@/components/signals/CommunityThreads";
import communityThreadsArtifact from "@/data/artifacts/community-threads.json";

// ---------------------------------------------------------------------------
// Draft page — /signals/draft?id=<thread_id>
//
// Thread is loaded from:
//   1. sessionStorage (set by ThreadCard — same tab navigation)
//   2. community-threads.json artifact (fallback — works in new tab/window)
// ---------------------------------------------------------------------------

function findThreadInArtifact(id: string): CommunityThread | null {
  const threads = (communityThreadsArtifact as { data: { threads: CommunityThread[] } }).data.threads;
  return threads.find((t) => t.id === id) ?? null;
}

export default function DraftPage() {
  return (
    <Suspense fallback={<main className="draft-page"><div className="draft-page-empty"><p>Loading…</p></div></main>}>
      <DraftPageContent />
    </Suspense>
  );
}

function DraftPageContent() {
  const searchParams = useSearchParams();
  const threadId = searchParams.get("id");

  const [thread, setThread] = useState<CommunityThread | null>(null);
  const [draftState, setDraftState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [draftText, setDraftText] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load thread — sessionStorage first, artifact fallback
  useEffect(() => {
    if (!threadId) return;

    // Try sessionStorage (same-tab navigation)
    try {
      const stored = sessionStorage.getItem(`draft-thread-${threadId}`);
      if (stored) {
        setThread(JSON.parse(stored));
        return;
      }
    } catch { /* ignore */ }

    // Fallback — look up from artifact (new tab / direct URL)
    const found = findThreadInArtifact(threadId);
    if (found) setThread(found);
  }, [threadId]);

  // Auto-generate draft when thread loads
  useEffect(() => {
    if (thread && draftState === "idle") {
      void handleGenerate(thread);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread]);

  async function handleGenerate(t: CommunityThread) {
    setDraftState("loading");
    setDraftText("");
    setDraftError(null);

    try {
      const res = await fetch("/api/community/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread: t }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDraftError(data.error ?? "Draft generation failed.");
        setDraftState("error");
      } else {
        setDraftText(data.draft ?? "");
        setDraftState("done");
      }
    } catch {
      setDraftError("Network error. Try again.");
      setDraftState("error");
    }
  }

  async function handleCopy() {
    if (!draftText) return;
    await navigator.clipboard.writeText(draftText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!thread) {
    return (
      <main className="draft-page">
        <div className="draft-page-empty">
          <p>Thread not found.</p>
          <a href="/signals" className="draft-back-btn">← Back to Signals</a>
        </div>
      </main>
    );
  }

  const intentLabel = thread.intent && thread.intent !== "other"
    ? thread.intent.replaceAll("_", " ")
    : null;

  return (
    <main className="draft-page">
      {/* Header */}
      <div className="draft-page-header">
        <a href="/signals" className="draft-back-btn">
          <ArrowLeft size={14} aria-hidden="true" />
          Back to Signals
        </a>
        <span className="draft-page-title">Draft reply</span>
      </div>

      {/* Thread context */}
      <div className="draft-thread-context">
        <div className="draft-thread-meta">
          <span className="draft-thread-subreddit">r/{thread.subreddit}</span>
          {intentLabel ? (
            <span className="draft-thread-intent">{intentLabel}</span>
          ) : null}
        </div>
        <h1 className="draft-thread-title">
          <a href={thread.url} rel="noreferrer" target="_blank">
            {thread.title}
          </a>
        </h1>
        {thread.body ? (
          <p className="draft-thread-body">
            {thread.body.slice(0, 400)}{thread.body.length > 400 ? "…" : ""}
          </p>
        ) : null}
        <a href={thread.url} rel="noreferrer" target="_blank" className="draft-thread-link">
          View on Reddit <ExternalLink size={11} aria-hidden="true" />
        </a>
      </div>

      {/* Draft block */}
      <div className="draft-block">
        <div className="draft-block-head">
          <span className="draft-block-label">Generated reply</span>
          <div className="draft-block-actions">
            {draftState === "done" ? (
              <>
                <button
                  type="button"
                  className="draft-icon-btn"
                  onClick={() => handleGenerate(thread)}
                  title="Regenerate draft"
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  Regenerate
                </button>
                <button
                  type="button"
                  className="draft-icon-btn draft-icon-btn--copy"
                  onClick={handleCopy}
                  title="Copy to clipboard"
                >
                  {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                  {copied ? "Copied!" : "Copy"}
                </button>
                <a
                  href={thread.url}
                  rel="noreferrer"
                  target="_blank"
                  className="draft-icon-btn draft-icon-btn--post"
                  title="Open Reddit thread to paste your reply"
                >
                  <ExternalLink size={14} aria-hidden="true" />
                  Post on Reddit
                </a>
              </>
            ) : null}
          </div>
        </div>

        {draftState === "loading" ? (
          <div className="draft-loading">
            <span className="draft-loading-dot" />
            <span className="draft-loading-dot" />
            <span className="draft-loading-dot" />
            <span>Generating draft…</span>
          </div>
        ) : draftState === "error" ? (
          <div className="draft-error">
            <p>{draftError}</p>
            <button
              type="button"
              className="draft-icon-btn"
              onClick={() => handleGenerate(thread)}
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="draft-code-block">
            <textarea
              ref={textareaRef}
              className="draft-code-textarea"
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              spellCheck
              aria-label="Draft reply — edit before posting"
            />
            <button
              type="button"
              className="draft-code-copy-btn"
              onClick={handleCopy}
              title="Copy"
              aria-label="Copy draft to clipboard"
            >
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            </button>
          </div>
        )}

        <p className="draft-disclaimer">
          Review and edit before posting · Human approval required · Never auto-posted to Reddit
        </p>
      </div>
    </main>
  );
}
