"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart } from "ai";
import type { UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MessageResponse } from "@/components/ai-elements/message";
import { ProvenanceChip } from "@/components/shell/ProvenanceChip";

interface AdAnalystModalProps {
  aiEnabled: boolean;
}

const SESSIONS_KEY = "xpat-ad-analyst-sessions";   // stores all sessions
const ACTIVE_KEY  = "xpat-ad-analyst-active-session"; // stores active session id
const openAnalystEvent  = "xpat:open-ad-analyst";

const SUGGESTIONS = [
  "Which campaign has the lowest CPC?",
  "Compare Meta vs Google this month",
  "What is our total ad budget used in the last 30 days?",
  "Which campaigns drove the most actual signups?",
];

type MessagePart = UIMessage["parts"][number];
type ModalState = "closed" | "open" | "minimized";

// --------------------------------------------------------------------------
// Session data model
// --------------------------------------------------------------------------
interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt?: string;
}

interface Session {
  id: string;
  title: string;       // first user question, truncated
  createdAt: string;
  messages: StoredMessage[];
}

// --------------------------------------------------------------------------
// localStorage helpers
// --------------------------------------------------------------------------
function loadSessions(): Session[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSessions(sessions: Session[]) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch { /* quota exceeded */ }
}

function loadActiveId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_KEY);
}

function saveActiveId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

function newSessionId() {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// DynamoDB API helpers — fall back to localStorage if API unavailable
// ---------------------------------------------------------------------------

async function fetchSessionsFromApi(): Promise<Session[]> {
  try {
    const res = await fetch("/api/ad-analyst/history", { credentials: "include" });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.sessions ?? []).map((item: {
      conversationId: string; title: string; createdAt: string;
      messages: StoredMessage[];
    }) => ({
      id: item.conversationId,
      title: item.title,
      createdAt: item.createdAt,
      messages: item.messages ?? [],
    }));
  } catch {
    return [];
  }
}

async function saveSessionToApi(session: Session): Promise<void> {
  try {
    await fetch("/api/ad-analyst/history", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        messages: session.messages,
      }),
    });
  } catch { /* silently fail — localStorage is the fallback */ }
}

async function clearSessionsFromApi(): Promise<void> {
  try {
    await fetch("/api/ad-analyst/history", {
      method: "DELETE",
      credentials: "include",
    });
  } catch { /* silently fail */ }
}

function storedToUIMessages(stored: StoredMessage[]): UIMessage[] {
  return stored.map((s) => ({
    id: s.id,
    role: s.role,
    parts: [{ type: "text" as const, text: s.text }],
    createdAt: s.createdAt ? new Date(s.createdAt) : undefined,
  }));
}

function messagesToStored(messages: UIMessage[]): StoredMessage[] {
  const result: StoredMessage[] = [];
  for (const m of messages) {
    const textPart = m.parts.find((p) => p.type === "text");
    const text = textPart?.type === "text" ? textPart.text : "";
    if (!text) continue;
    result.push({ id: m.id, role: m.role as "user" | "assistant", text });
  }
  return result;
}

// --------------------------------------------------------------------------
// Render helpers
// --------------------------------------------------------------------------
function renderPart(messageId: string, part: MessagePart, index: number) {
  if (part.type === "text") {
    return part.text ? (
      <MessageResponse key={`${messageId}-text-${index}`}>
        {part.text}
      </MessageResponse>
    ) : null;
  }
  if (isToolUIPart(part)) {
    const working = part.state === "input-streaming" || part.state === "input-available";
    return working ? (
      <div className="evidence-step" key={`${messageId}-tool-${index}`}>
        <span className="evidence-step-dot" aria-hidden="true" />
        <span className="evidence-step-name">querying data...</span>
      </div>
    ) : null;
  }
  return null;
}

// --------------------------------------------------------------------------
// Main component
// --------------------------------------------------------------------------
export function AdAnalystModal({ aiEnabled }: AdAnalystModalProps) {
  const [modalState, setModalState] = useState<ModalState>("closed");
  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    const stored = loadSessions();
    const lastActive = loadActiveId();
    if (lastActive && stored.some((s) => s.id === lastActive)) return lastActive;
    return null;
  });
  const bodyRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/ad-analyst" }),
    [],
  );

  const { messages, sendMessage, status, setMessages } = useChat({
    transport,
  });

  const isBusy = status === "submitted" || status === "streaming";

  // ------------------------------------------------------------------
  // Sync active session messages into chat whenever session switches
  // ------------------------------------------------------------------
  useEffect(() => {
    if (activeSessionId === null) {
      setMessages([]);
      return;
    }
    const session = sessions.find((s) => s.id === activeSessionId);
    if (session) {
      setMessages(storedToUIMessages(session.messages));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // ------------------------------------------------------------------
  // Persist messages to the active session on every change
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!activeSessionId || messages.length === 0) return;

    const stored = messagesToStored(messages);
    const firstUserMsg = stored.find((m) => m.role === "user");

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessions((prev) => {
      const updated = prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        return {
          ...s,
          messages: stored,
          title: firstUserMsg
            ? firstUserMsg.text.length > 45
              ? `${firstUserMsg.text.slice(0, 45)}…`
              : firstUserMsg.text
            : s.title,
        };
      });
      saveSessions(updated);
      // Also persist to DynamoDB
      const updatedSession = updated.find((s) => s.id === activeSessionId);
      if (updatedSession) saveSessionToApi(updatedSession);
      return updated;
    });
  }, [messages, activeSessionId]);

  // ------------------------------------------------------------------
  // Global open event from TopNav button
  // ------------------------------------------------------------------
  useEffect(() => {
    const handler = () => setModalState("open");
    window.addEventListener(openAnalystEvent, handler);
    return () => window.removeEventListener(openAnalystEvent, handler);
  }, []);

  // ------------------------------------------------------------------
  // Escape key minimizes
  // ------------------------------------------------------------------
  useEffect(() => {
    if (modalState !== "open") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalState("minimized");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modalState]);

  // ------------------------------------------------------------------
  // Auto-scroll chat
  // ------------------------------------------------------------------
  useEffect(() => {
    if (modalState === "open" && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, isBusy, modalState]);

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  // Start a brand-new empty session
  const startNewSession = useCallback(() => {
    const id = newSessionId();
    const session: Session = {
      id,
      title: "New conversation",
      createdAt: new Date().toISOString(),
      messages: [],
    };
    setSessions((prev) => {
      const updated = [session, ...prev];
      saveSessions(updated);
      return updated;
    });
    setActiveSessionId(id);
    saveActiveId(id);
    setMessages([]);
    setInput("");
  }, [setMessages]);

  // Switch to an existing session (does NOT re-ask the question)
  const switchSession = useCallback((id: string) => {
    if (id === activeSessionId) return; // already active - do nothing
    if (isBusy) return;                 // block switching while a response is streaming
    setActiveSessionId(id);
    saveActiveId(id);
    setInput("");
  }, [activeSessionId, isBusy]);

  // Send a message - creates a session if none is active
  const submit = useCallback((text: string) => {
    const q = text.trim();
    if (!q || isBusy) return;

    let sessionId = activeSessionId;

    // If no session exists yet, create one now
    if (!sessionId) {
      sessionId = newSessionId();
      const session: Session = {
        id: sessionId,
        title: q.length > 45 ? `${q.slice(0, 45)}…` : q,
        createdAt: new Date().toISOString(),
        messages: [],
      };
      setSessions((prev) => {
        const updated = [session, ...prev];
        saveSessions(updated);
        return updated;
      });
      setActiveSessionId(sessionId);
      saveActiveId(sessionId);
    }

    setInput("");
    setModalState("open");
    void sendMessage({ text: q });
  }, [activeSessionId, isBusy, sendMessage]);

  // Clear all sessions
  const clearAll = useCallback(() => {
    try {
      localStorage.removeItem(SESSIONS_KEY);
      localStorage.removeItem(ACTIVE_KEY);
    } catch { /* ignore */ }
    clearSessionsFromApi(); // also clear from DynamoDB
    setSessions([]);
    setActiveSessionId(null);
    setMessages([]);
  }, [setMessages]);

  // Delete a single session
  const deleteSession = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent switching to session when clicking delete
    const updated = sessions.filter(s => s.id !== sessionId);
    saveSessions(updated);
    setSessions(updated);

    // If deleting the active session, switch to most recent or clear
    if (sessionId === activeSessionId) {
      const next = updated[0] ?? null;
      saveActiveId(next?.id ?? null);
      setActiveSessionId(next?.id ?? null);
      setMessages(
        next ? next.messages.map(m => ({
          id: m.id, role: m.role,
          parts: [{ type: "text" as const, text: m.text }],
        })) : []
      );
    }
  }, [sessions, activeSessionId, setMessages]);

  // ------------------------------------------------------------------
  // Minimized pill
  // ------------------------------------------------------------------
  if (modalState === "minimized") {
    return (
      <button
        className="ad-analyst-pill"
        onClick={() => setModalState("open")}
        type="button"
        aria-label="Expand Ad Analyst"
      >
        <span className="ad-analyst-pill-dot" aria-hidden="true" />
        Ad Analyst
        {messages.length > 0 && (
          <span className="ad-analyst-pill-count">
            {messages.filter((m) => m.role === "user").length}
          </span>
        )}
      </button>
    );
  }

  if (modalState === "closed") return null;

  // ------------------------------------------------------------------
  // Full modal
  // ------------------------------------------------------------------
  return (
    <>
      <div
        className="ad-analyst-backdrop"
        onClick={() => setModalState("minimized")}
        aria-hidden="true"
      />

      <div
        className="ad-analyst-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Ad Analyst"
      >
        {/* Header */}
        <header className="ad-analyst-modal-header">
          <div className="ad-analyst-modal-title">
            <span className="ad-analyst-modal-dot" aria-hidden="true" />
            <span>Ad Analyst</span>
            <span className="ad-analyst-modal-sub">
              Meta + Google Ads · live data
            </span>
          </div>
          <div className="ad-analyst-modal-actions">
            <button
              className="ad-analyst-modal-btn"
              onClick={() => setModalState("minimized")}
              type="button"
              aria-label="Minimize"
              title="Minimize"
            >
              &#8722;
            </button>
            <button
              className="ad-analyst-modal-btn ad-analyst-modal-btn-close"
              onClick={() => setModalState("closed")}
              type="button"
              aria-label="Close"
              title="Close"
            >
              &#215;
            </button>
          </div>
        </header>

        <div className="ad-analyst-modal-body">
          {/* ---- Left panel - sessions ---- */}
          <aside className="ad-analyst-left">

            {/* New conversation button - always at top */}
            <button
              className="ad-analyst-new-btn"
              onClick={startNewSession}
              type="button"
              disabled={isBusy}
            >
              <span aria-hidden="true">+</span> New conversation
            </button>

            <div className="ad-analyst-left-section">
              <div className="ad-analyst-left-section-row">
                <h3 className="ad-analyst-left-heading">Past conversations</h3>
                {sessions.length > 0 && (
                  <button
                    className="ad-analyst-clear-btn"
                    onClick={clearAll}
                    type="button"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {sessions.length === 0 ? (
                <p className="ad-analyst-history-empty">
                  No conversations yet. Ask something to get started.
                </p>
              ) : (
                <ul className="ad-analyst-history-list">
                  {sessions.map((session) => {
                    const isActive = session.id === activeSessionId;
                    return (
                      <li key={session.id} className="ad-analyst-history-item">
                        <button
                          className={`ad-analyst-history-btn${isActive ? " ad-analyst-history-btn-active" : ""}`}
                          onClick={() => switchSession(session.id)}
                          type="button"
                          title={isBusy && !isActive ? "Wait for the current response to finish before switching" : session.title}
                          disabled={isBusy && !isActive}
                        >
                          {session.title}
                        </button>
                        <button
                          className="ad-analyst-history-delete"
                          onClick={(e) => deleteSession(session.id, e)}
                          type="button"
                          title="Delete conversation"
                          aria-label="Delete conversation"
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          {/* ---- Right panel - chat ---- */}
          <div className="ad-analyst-right">
            <div className="ad-analyst-chat-body" ref={bodyRef}>
              {messages.length === 0 ? (
                <div className="ad-analyst-empty-state">
                  <p className="ad-analyst-empty-intro">
                    Ask about campaign budget, CPC, CTR, impressions, or platform comparisons.
                  </p>
                  <ul className="ad-analyst-suggestion-list">
                    {SUGGESTIONS.map((s) => (
                      <li key={s}>
                        <button
                          className="ad-analyst-suggestion-btn"
                          onClick={() => submit(s)}
                          type="button"
                          disabled={isBusy}
                        >
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {messages.map((message) => (
                <div
                  className={`evidence-message evidence-message-${message.role}`}
                  key={message.id}
                >
                  <span className="evidence-role">
                    {message.role === "user" ? "You" : "AD ANALYST"}
                  </span>
                  <div className="evidence-message-body">
                    {message.parts.map((part, i) => renderPart(message.id, part, i))}
                  </div>
                </div>
              ))}

              {isBusy ? (
                <p aria-live="polite" className="evidence-status">
                  Analysing ad data
                  <span aria-hidden="true" className="evidence-cursor">{"\u258d"}</span>
                </p>
              ) : null}
            </div>

            {aiEnabled ? (
              <form
                className="evidence-form ad-analyst-form"
                onSubmit={(e) => { e.preventDefault(); submit(input); }}
              >
                <input
                  aria-label="Ask about ad performance"
                  className="evidence-input"
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about ad performance..."
                  value={input}
                  autoFocus
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
                <span>AI credentials are not configured for this environment.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export function openAdAnalyst() {
  window.dispatchEvent(new CustomEvent(openAnalystEvent));
}
