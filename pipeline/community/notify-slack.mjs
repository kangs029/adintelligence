/**
 * pipeline/community/notify-slack.mjs
 *
 * Sends a Reddit post + AI draft reply to the #xpat-reddit-review Slack channel
 * for human review before posting.
 *
 * Workflow:
 *   1. Pipeline finds a new Reddit thread XPAT should reply to
 *   2. AI generates a draft reply (community-drafter.mjs)
 *   3. This module posts both to Slack for human review
 *   4. Human copies the draft, edits if needed, posts from their Reddit account
 *
 * Phase 1 — webhook only (no interactive buttons, no server required).
 * Human review via emoji reactions: ✅ approve | ✏️ edit | ❌ skip
 *
 * Usage:
 *   import { notifySlack, notifySlackBatch } from "./notify-slack.mjs";
 *
 * Env vars:
 *   SLACK_WEBHOOK_URL — Incoming Webhook URL from XPAT Community Bot app
 */

const MAX_TEXT_LENGTH = 2800; // Slack block text limit is 3000 chars
const MAX_DRAFT_LENGTH = 1500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(text, maxLen) {
  if (!text) return "";
  const s = String(text).trim();
  return s.length > maxLen ? s.slice(0, maxLen - 3) + "..." : s;
}

function formatDate(isoStr) {
  if (!isoStr) return "unknown";
  return isoStr.slice(0, 10);
}

function subredditUrl(subreddit) {
  return `https://reddit.com/r/${subreddit}`;
}

function postUrl(thread) {
  if (thread.permalink) return `https://reddit.com${thread.permalink}`;
  if (thread.url) return thread.url;
  return `https://reddit.com/r/${thread.subreddit}`;
}

// ---------------------------------------------------------------------------
// Build Slack Block Kit payload
// ---------------------------------------------------------------------------

function buildSlackPayload({ thread, draft, index, total, appUrl }) {
  const url = postUrl(thread);
  const appDraftUrl = appUrl
    ? `${appUrl}/signals/draft?id=${encodeURIComponent(thread.id)}`
    : null;
  const title = truncate(thread.title, 150);
  const body = truncate(thread.selftext || thread.body || "", MAX_TEXT_LENGTH);
  const draftText = truncate(draft, MAX_DRAFT_LENGTH);
  const counter = total > 1 ? ` (${index + 1}/${total})` : "";
  const subreddit = thread.subreddit ?? "unknown";
  const postedAt = formatDate(thread.createdAt ?? thread.created_utc);
  const score = thread.score ?? 0;
  const comments = thread.numComments ?? thread.num_comments ?? 0;

  const blocks = [
    // ── Post title as clickable link + metadata inline ──
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*<${url}|${title}>*\nr/${subreddit}  ·  ${score} upvotes  ·  ${comments} comments  ·  Posted ${postedAt}`,
      },
    },
  ];

  // ── Post description ──
  if (body && body.length > 10) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: body },
    });
  }

  blocks.push({ type: "divider" });

  // ── Draft reply box ──
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `📝 *Draft reply${counter}*\n\`\`\`${draftText}\`\`\``,
    },
  });

  // ── Approve / Reject / View on Reddit / Review in app ──
  const actionButtons = [
    {
      type: "button",
      text: { type: "plain_text", text: "✅  Approve", emoji: true },
      style: "primary",
      value: `approve_${thread.id}`,
    },
    {
      type: "button",
      text: { type: "plain_text", text: "❌  Reject", emoji: true },
      style: "danger",
      value: `reject_${thread.id}`,
    },
    {
      type: "button",
      text: { type: "plain_text", text: "View post on Reddit", emoji: true },
      url,
      value: `view_${thread.id}`,
    },
  ];

  // Add "Review in XPAT OS" button if app URL is configured
  if (appDraftUrl) {
    actionButtons.push({
      type: "button",
      text: { type: "plain_text", text: "✏️  Review in XPAT OS", emoji: true },
      url: appDraftUrl,
      value: `app_${thread.id}`,
    });
  }

  blocks.push({ type: "actions", elements: actionButtons });

  // ── Footer ──
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Post ID: \`${thread.id}\`${appDraftUrl ? `   |   <${appDraftUrl}|Open in XPAT OS →>` : ""}`,
      },
    ],
  });

  return { blocks };
}

// ---------------------------------------------------------------------------
// Send a single notification
// ---------------------------------------------------------------------------

/**
 * @param {object} opts
 * @param {object} opts.thread       - Community thread object from community-threads.json
 * @param {string} opts.draft        - AI-generated draft reply text
 * @param {string} [opts.webhookUrl] - Slack webhook URL (defaults to SLACK_WEBHOOK_URL env var)
 * @param {string} [opts.appUrl]     - Base URL of the XPAT OS app (e.g. https://xpat.money or http://localhost:3000)
 * @param {number} [opts.index]      - Position in batch (0-based), for counter display
 * @param {number} [opts.total]      - Total in batch, for counter display
 * @returns {Promise<{ ok: boolean; error?: string }>}
 */
export async function notifySlack({
  thread,
  draft,
  webhookUrl = process.env.SLACK_WEBHOOK_URL,
  appUrl = process.env.XPAT_APP_URL ?? "http://localhost:3000",
  index = 0,
  total = 1,
}) {
  if (!webhookUrl) {
    return { ok: false, error: "SLACK_WEBHOOK_URL is not configured." };
  }

  if (!thread || !draft) {
    return { ok: false, error: "thread and draft are required." };
  }

  const payload = buildSlackPayload({ thread, draft, index, total, appUrl });

  let res;
  try {
    res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { ok: false, error: `Network error: ${err.message}` };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Slack HTTP ${res.status}: ${body.slice(0, 200)}` };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Send a batch of notifications (with rate limiting)
// ---------------------------------------------------------------------------

/**
 * Sends notifications for multiple threads, with a 1-second delay between
 * each to avoid Slack rate limits (1 message/second per webhook).
 *
 * @param {Array<{ thread: object, draft: string }>} items
 * @param {string} [webhookUrl]
 * @returns {Promise<{ sent: number, failed: number, errors: string[] }>}
 */
export async function notifySlackBatch(items, webhookUrl = process.env.SLACK_WEBHOOK_URL) {
  let sent = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < items.length; i++) {
    const { thread, draft } = items[i];

    const result = await notifySlack({
      thread,
      draft,
      webhookUrl,
      index: i,
      total: items.length,
    });

    if (result.ok) {
      sent++;
      console.log(`[notify-slack] ✓ Sent notification for thread ${thread.id}`);
    } else {
      failed++;
      errors.push(`${thread.id}: ${result.error}`);
      console.warn(`[notify-slack] ✗ Failed for thread ${thread.id}: ${result.error}`);
    }

    // Rate limit: 1 message/second per Slack webhook
    if (i < items.length - 1) {
      await new Promise(r => setTimeout(r, 1100));
    }
  }

  return { sent, failed, errors };
}

// ---------------------------------------------------------------------------
// CLI test mode — run directly to test the webhook with a real thread + real AI draft
// node --env-file=.env.local pipeline/community/notify-slack.mjs --test
// node --env-file=.env.local pipeline/community/notify-slack.mjs --test --app-url https://xpat.money
// ---------------------------------------------------------------------------

if (process.argv.includes("--test")) {
  const appUrlArg = process.argv.indexOf("--app-url");
  const testAppUrl = appUrlArg !== -1
    ? process.argv[appUrlArg + 1]
    : (process.env.XPAT_APP_URL ?? "http://localhost:3000");

  console.log("[notify-slack] Running test notification...");
  console.log(`[notify-slack] App URL: ${testAppUrl}`);

  // Load a real thread from community-threads.json
  let testThread;
  try {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const artifact = JSON.parse(readFileSync(join("data", "artifacts", "community-threads.json"), "utf8"));
    const threads = artifact.data.threads ?? [];
    // Pick first recent thread with a real URL
    testThread = threads.find(t =>
      t.recency === "recent" &&
      (t.url || t.permalink) &&
      t.title
    ) ?? threads[0];
    console.log(`[notify-slack] Using real thread: [${testThread.id}] ${testThread.title?.slice(0, 70)}`);
  } catch {
    // Fallback to static test thread if artifact not available
    testThread = {
      id: "1hl9idy",
      title: "Is Remit2Any legit? Looking for alternatives to Wise for USD to INR",
      selftext: "I've been using Wise for a while but their rates have been slipping lately. A colleague mentioned Remit2Any / XPAT. Has anyone used it?",
      subreddit: "nri",
      score: 47,
      numComments: 12,
      createdAt: new Date().toISOString(),
      permalink: "/r/nri/comments/1hl9idy/is_remit2any_legit/",
    };
    console.log("[notify-slack] Artifact not found, using fallback test thread.");
  }

  // Try to get a real AI draft from the running app
  let testDraft;
  try {
    console.log(`[notify-slack] Calling ${testAppUrl}/api/community/draft for real AI draft...`);
    const res = await fetch(`${testAppUrl}/api/community/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ thread: testThread }),
    });
    if (res.ok) {
      const data = await res.json();
      testDraft = data.draft;
      console.log(`[notify-slack] ✓ Real AI draft generated (KB context: ${data.kbContextUsed ?? false})`);
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`[notify-slack] Could not reach app (${err.message}). Using static fallback draft.`);
    console.warn("[notify-slack] Start the app with 'pnpm dev' to test with real AI drafts.");
    testDraft = `I switched to xpat.money about 6 months ago after getting tired of Wise's fees. The USD/INR rate they offer has been consistently better for me — usually 1-2 rupees above what I was getting on Wise. Zero transfer fees and it cleared in about 2 hours to my Indian bank account. Worth checking out if you're doing regular transfers.

*(Disclosure: I'm an XPAT user and may benefit from referrals.)*`;
  }

  const result = await notifySlack({
    thread: testThread,
    draft: testDraft,
    appUrl: testAppUrl,
  });

  if (result.ok) {
    console.log("[notify-slack] ✓ Test notification sent successfully. Check your Slack channel.");
  } else {
    console.error("[notify-slack] ✗ Test failed:", result.error);
    process.exit(1);
  }
}
