import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import SignalsPage from "@/app/signals/page";
import { StatTile } from "@/components/shell/StatTile";
import { findCopyViolations } from "../../scripts/check-copy.mjs";
import { CommunityThreads } from "./CommunityThreads";
import { ContentTopics } from "./ContentTopics";
import { CreatorGrid } from "./CreatorGrid";
import { GeoVisibility } from "./GeoVisibility";
import { ReviewPainRollup } from "./ReviewPainRollup";
import { SwitchMoments } from "./SwitchMoments";
import { TrendsPanel } from "./TrendsPanel";
import { XpatFootprintCard } from "./XpatFootprintCard";

const threadsArtifact = {
  data: {
    historicalCount: 2,
    recentCount: 1,
    status: "ok" as const,
    sweepErrors: [],
    threads: [
      {
        capturedAt: "2026-07-03T00:00:00.000Z",
        id: "t3_recent",
        matchedQueries: ["send money to india"],
        numComments: 12,
        publishedAt: "2026-06-20T00:00:00.000Z",
        recency: "recent" as const,
        score: 22,
        subreddit: "nri",
        themes: ["remittance"],
        title: "Best way to send money to India?",
        url: "https://www.reddit.com/r/nri/comments/recent",
      },
      {
        capturedAt: "2026-07-03T00:00:00.000Z",
        id: "t3_old",
        matchedQueries: ["transfer failed india"],
        numComments: 5,
        publishedAt: "2026-01-01T00:00:00.000Z",
        recency: "historical" as const,
        score: 9,
        subreddit: "h1b",
        themes: ["pain"],
        title: "Transfer failed to India",
        url: "https://www.reddit.com/r/h1b/comments/old",
      },
      {
        capturedAt: "2026-06-17T00:00:00.000Z",
        id: "t3_undated",
        matchedQueries: ["historical"],
        numComments: 0,
        publishedAt: null,
        publishedAtPrecision: "undated historical from v1 source label",
        recency: "historical" as const,
        score: 0,
        sourceAgeLabel: "Historical thread, not current outreach",
        subreddit: "nri",
        themes: ["comparison shopping"],
        title: "General best-service threads",
        url: "https://www.reddit.com/r/nri/comments/undated",
      },
    ],
  },
  meta: { generatedAt: "2026-07-03T00:00:00.000Z", provenance: "snapshot" as const },
};

const emptyCreatorsArtifact = {
  data: {
    creators: [],
    status: "connector-needed",
    sweepErrors: [{ message: "YOUTUBE_API_KEY is not configured." }],
  },
  meta: { generatedAt: "2026-07-03T00:00:00.000Z", provenance: "connector-needed" },
};

const creatorsArtifact = {
  data: {
    connectorNote: {
      label: "YouTube API access makes this live-refreshable",
      status: "connector-needed",
    },
    creators: [
      {
        audienceLang: "English + Indian NRI finance",
        capturedAt: "2026-06-17T00:00:00.000Z",
        currentSponsor: "Aspora",
        evidence: "Recent NRI remittance video description includes Aspora download link and code KEERTHI2026.",
        fitNote: "Audience-fit score 96/100 from v1 curated review.",
        fitScore: 96,
        followerTier: "Not listed",
        group: "evidence-linked",
        handle: "Keerthi's FinFo NRI",
        id: "v1-creator-01",
        link: "https://www.youtube.com/watch?v=6TErOV2S5e4",
        platform: "youtube",
        rank: 1,
        recencyLabel: "current: 5d ago",
      },
      {
        audienceLang: "Telugu",
        capturedAt: "2026-04-20T00:00:00.000Z",
        currentSponsor: null,
        evidence: "Approximation from older Telugu media lead. No current direct proof link captured for remittance content; verify manually before outreach.",
        fitNote: "Audience-fit score 70/100 from v1 curated review.",
        fitScore: 70,
        followerTier: "Not listed",
        group: "leads-to-verify",
        handle: "SumanTV USA-facing",
        id: "v1-creator-24",
        link: "https://www.youtube.com/watch?v=4qo8t-jhS0k",
        platform: "youtube",
        rank: 24,
        recencyLabel: "needs proof: Apr 20 lead",
      },
    ],
    evidenceLinkedCount: 1,
    leadsToVerifyCount: 1,
    status: "ok",
    sweepErrors: [],
  },
  meta: { generatedAt: "2026-06-17T00:00:00.000Z", provenance: "snapshot" },
} as const;

const emptyThreadsArtifact = {
  data: {
    historicalCount: 0,
    recentCount: 0,
    status: "ok" as const,
    sweepErrors: [],
    threads: [],
  },
  meta: { generatedAt: "2026-07-03T00:00:00.000Z", provenance: "snapshot" as const },
};

const reviewThemesArtifact = {
  data: {
    groups: [
      {
        competitor: "Remitly",
        sampleSize: 100,
        store: "android",
        themes: [
          { count: 20, examples: [], sharePct: 20, theme: "Speed" },
          { count: 5, examples: [], sharePct: 5, theme: "Fees" },
        ],
        window: { from: "2026-06-01", to: "2026-07-01" },
      },
      {
        competitor: "Wise",
        sampleSize: 100,
        store: "android",
        themes: [
          { count: 10, examples: [], sharePct: 10, theme: "Speed" },
          { count: 12, examples: [], sharePct: 12, theme: "Fees" },
        ],
        window: { from: "2026-06-01", to: "2026-07-01" },
      },
    ],
  },
  meta: { generatedAt: "2026-07-03T00:00:00.000Z" },
};

const switchMomentsArtifact = {
  data: {
    moments: [
      {
        excerpt: "I switched to Wise after support stopped replying.",
        id: "moment-1",
        matchedPattern: "switched to",
        provider: "Remitly",
        reviewDate: "2026-06-20T00:00:00.000Z",
        store: "ios",
        theme: "Support",
      },
    ],
    scannedExcerpts: 2094,
    sourceReviewExcerpts: 2094,
    status: "ok",
    switchIntentCount: 1,
  },
  meta: { generatedAt: "2026-07-03T00:00:00.000Z" },
} as const;

const geoVisibilityArtifact = {
  data: {
    assistants: ["ChatGPT", "Gemini"],
    capturedAnswers: 1,
    cells: [
      {
        assistant: "ChatGPT",
        capturedAt: "2026-07-06T00:00:00.000Z",
        evidenceScreenshotPath: "data/raw/geo/chatgpt.png",
        method: "manual capture",
        providersNamed: ["Wise", "Remitly"],
        query: "best way to send money from USA to India",
        status: "captured",
        xpatMentioned: false,
      },
      {
        assistant: "Gemini",
        capturedAt: null,
        evidenceScreenshotPath: null,
        method: "manual capture",
        pendingReason: "Manual capture pending.",
        providersNamed: [],
        query: "best way to send money from USA to India",
        status: "capture-pending",
        xpatMentioned: false,
      },
    ],
    competitorsAppearing: ["Remitly", "Wise"],
    queries: ["best way to send money from USA to India"],
    status: "partial",
    totalCells: 2,
    xpatMentions: 0,
  },
  meta: { generatedAt: "2026-07-06T00:00:00.000Z" },
} as const;

const pendingGeoVisibilityArtifact = {
  data: {
    assistants: ["ChatGPT", "Gemini", "Claude", "Perplexity"],
    capturedAnswers: 0,
    cells: [
      "best way to send money from USA to India",
      "cheapest USD to INR transfer",
      "best remittance app for NRIs",
      "Wise vs Remitly for India",
      "is Xpat money transfer legit",
    ].flatMap((query) =>
      ["ChatGPT", "Gemini", "Claude", "Perplexity"].map((assistant) => ({
        assistant,
        capturedAt: null,
        evidenceScreenshotPath: null,
        method: "manual capture",
        pendingReason: "Manual assistant answer capture is pending.",
        providersNamed: [],
        query,
        status: "capture-pending",
        xpatMentioned: false,
      })),
    ),
    competitorsAppearing: [],
    queries: [
      "best way to send money from USA to India",
      "cheapest USD to INR transfer",
      "best remittance app for NRIs",
      "Wise vs Remitly for India",
      "is Xpat money transfer legit",
    ],
    status: "partial",
    totalCells: 20,
    xpatMentions: 0,
  },
  meta: { generatedAt: "2026-07-06T00:00:00.000Z" },
} as const;

const xpatFootprintArtifact = {
  data: {
    observations: [
      {
        capturedAt: "2026-06-17T00:00:00.000Z",
        id: "obs_007",
        recommendedUse: "Use as the first owned visibility benchmark across Search, YouTube, and Play placements.",
        sourcePlatform: "Google Ads Transparency Center",
        sourceUrl: "https://adstransparency.google.com/advertiser/AR05946074718833475585?region=US",
        summary: "Google Ads Transparency Center shows verified advertiser Remit2Any Inc in the United States with 57 public ads.",
        title: "Owned brand has visible Google ad footprint",
      },
    ],
    status: "ok",
    summary: "Xpat already advertises, including Telugu community event sponsorships. The gap is not presence, it is audience-targeted efficiency.",
  },
  meta: { generatedAt: "2026-06-17T00:00:00.000Z" },
} as const;

describe("signals page components", () => {
  it("splits community threads by publishedAt recency and explains capturedAt", () => {
    const html = renderToStaticMarkup(<CommunityThreads artifact={threadsArtifact} />);

    expect(html).toContain("Recent (60d)");
    expect(html).toContain("Historical");
    expect(html).toContain("Best way to send money to India?");
    expect(html).toContain("Transfer failed to India");
    expect(html).toContain("publishedAt undated historical");
    expect(html).toContain("capturedAt is when Xpat OS saw the thread");
    expect(findCopyViolations(html, "components/signals/CommunityThreads.tsx")).toEqual([]);
  });

  it("renders connector-needed creator state without invented channels", () => {
    const html = renderToStaticMarkup(<CreatorGrid artifact={emptyCreatorsArtifact} />);

    expect(html).toContain("Needs YouTube API access");
    expect(html).toContain("YouTube API access is not configured.");
    expect(html).toContain("Unlocks creator cards with public channels");
    expect(html).toContain("YOUTUBE_API_KEY");
    expect(html).toContain("No outreach has occurred, no pricing is implied.");
    expect(findCopyViolations(html, "components/signals/CreatorGrid.tsx")).toEqual([]);
  });

  it("renders v1 creators in evidence-linked and lead groups", () => {
    const html = renderToStaticMarkup(<CreatorGrid artifact={creatorsArtifact} />);

    expect(html).toContain("diaspora or corridor-adjacent evidence");
    expect(html).not.toContain("US-based Indians");
    expect(html).toContain("Evidence-linked creators");
    expect(html).toContain("Leads to verify");
    expect(html).toContain("Aspora");
    expect(html).toContain("profile source");
    expect(html).toContain("See creator play");
    expect(html).not.toContain("2026-07");
    expect(findCopyViolations(html, "components/signals/CreatorGrid.tsx")).toEqual([]);
  });

  it("keeps live YouTube API creator rows visible as leads to verify", () => {
    const liveArtifact = {
      data: {
        creators: [
          {
            audienceFitNote: "Curated audience-fit note needed.",
            capturedAt: "2026-07-06T00:00:00.000Z",
            channelId: "UC_live",
            name: "Live NRI Finance Channel",
            recentRelevantVideos: [
              {
                publishedAt: "2026-07-05T00:00:00.000Z",
                title: "How NRIs send money to India",
                url: "https://www.youtube.com/watch?v=abc",
                views: 1200,
              },
            ],
            subscriberCount: 42000,
            url: "https://www.youtube.com/channel/UC_live",
          },
        ],
        status: "ok",
        sweepErrors: [],
      },
      meta: { generatedAt: "2026-07-06T00:00:00.000Z", provenance: "snapshot" },
    } as const;
    const html = renderToStaticMarkup(<CreatorGrid artifact={liveArtifact} />);

    expect(html).toContain("Leads to verify");
    expect(html).toContain("Live NRI Finance Channel");
    expect(html).toContain("42,000 subscribers");
    expect(html).toContain("Recent YouTube API video");
    expect(findCopyViolations(html, "components/signals/CreatorGrid.tsx")).toEqual([]);
  });

  it("renders designed empty cards for empty thread buckets", () => {
    const html = renderToStaticMarkup(<CommunityThreads artifact={emptyThreadsArtifact} />);

    expect(html).toContain("thread-empty-card");
    expect(html).toContain("No dated recent threads yet.");
    expect(html).toContain("No dated historical threads yet.");
  });

  it("labels empty thread buckets as pending access when Reddit is blocked", () => {
    const blockedThreadsArtifact = {
      ...emptyThreadsArtifact,
      data: {
        ...emptyThreadsArtifact.data,
        status: "blocked" as const,
        sweepErrors: [
          {
            message: "Reddit API access is not configured; unauthenticated Reddit JSON returned HTTP 403.",
            status: 403,
          },
        ],
      },
      meta: { generatedAt: "2026-07-03T00:00:00.000Z", provenance: "connector-needed" as const },
    };
    const html = renderToStaticMarkup(<CommunityThreads artifact={blockedThreadsArtifact} />);

    expect(html).toContain("Pending Reddit access for recent thread capture.");
    expect(html).toContain("Pending Reddit access for historical thread capture.");
    expect(html).toContain("Unlocks dated community threads");
    expect(findCopyViolations(html, "components/signals/CommunityThreads.tsx")).toEqual([]);
  });

  it("renders category review pain rollup from review theme counts", () => {
    const html = renderToStaticMarkup(<ReviewPainRollup artifact={reviewThemesArtifact} />);

    expect(html).toContain("Category review pain");
    expect(html).toContain("review-pain-bar-track");
    expect(html).toContain("review-pain-percent");
    expect(html).toContain("Speed");
    expect(html).toContain("15%");
    expect(html).toContain("n=30");
    expect(html).toContain("Fees");
    expect(html).toContain("9%");
    expect(html).toContain("n=17");
    expect(html).toContain("Use as messaging angle");
  });

  it("renders warm switching moments with action links", () => {
    const html = renderToStaticMarkup(<SwitchMoments artifact={switchMomentsArtifact} />);

    expect(html).toContain("Warm switching moments");
    expect(html).toContain("I switched to Wise");
    expect(html).toContain("Use as messaging angle");
    expect(findCopyViolations(html, "components/signals/SwitchMoments.tsx")).toEqual([]);
  });

  it("renders AI visibility grid with captured and pending cells", () => {
    const html = renderToStaticMarkup(<GeoVisibility artifact={geoVisibilityArtifact} />);

    expect(html).toContain("AI answer visibility");
    expect(html).toContain("Xpat is named in 0 of 1 captured answers");
    expect(html).toContain("Wise");
    expect(html).toContain("capture pending");
    expect(html).toContain("Route into content play");
    expect(findCopyViolations(html, "components/signals/GeoVisibility.tsx")).toEqual([]);
  });

  it("collapses AI visibility to a compact pending state when every cell needs capture", () => {
    const html = renderToStaticMarkup(<GeoVisibility artifact={pendingGeoVisibilityArtifact} />);

    expect(html).toContain("No assistant answers have been captured yet.");
    expect(html).toContain("Capture pending for the full benchmark");
    expect(html).toContain("best remittance app for NRIs");
    expect(html).not.toContain("geo-grid");
    expect(html).not.toContain("0 of 0");
    expect(html).not.toContain("0 of 20");
    expect(findCopyViolations(html, "components/signals/GeoVisibility.tsx")).toEqual([]);
  });

  it("renders content topics and reply angles from existing Signals artifacts", () => {
    const html = renderToStaticMarkup(
      <ContentTopics
        creators={creatorsArtifact}
        geoVisibility={pendingGeoVisibilityArtifact}
        reviewThemes={reviewThemesArtifact}
        switchMoments={switchMomentsArtifact}
        threads={threadsArtifact}
      />,
    );

    expect(html).toContain("Content topics and reply angles");
    expect(html).toContain("Community reply:");
    expect(html).toContain("Review angle:");
    expect(html).toContain("Warm switching moment");
    expect(html).toContain("Creator brief cue");
    expect(html).toContain("AI answer benchmark setup");
    expect(html).toContain("thread source");
    expect(html).toContain("proof link");
    expect(html).toContain("source unavailable");
    expect(html).toContain("capture pending");
    expect(html).toContain("Human review still happens before publishing.");
    expect(findCopyViolations(html, "components/signals/ContentTopics.tsx")).toEqual([]);
  });

  it("renders Xpat footprint card with original capture date and transparency source", () => {
    const html = renderToStaticMarkup(<XpatFootprintCard artifact={xpatFootprintArtifact} />);

    expect(html).toContain("Xpat&#x27;s own public footprint");
    expect(html).toContain("2026-06-17");
    expect(html).toContain("Google Ads Transparency Center");
    expect(html).toContain("transparency page");
    expect(findCopyViolations(html, "components/signals/XpatFootprintCard.tsx")).toEqual([]);
  });

  it("uses the full review corpus as the category review-pain denominator", () => {
    const sparseThemeArtifact = {
      data: {
        groups: [
          {
            competitor: "Remitly",
            sampleSize: 100,
            store: "android",
            themes: [{ count: 20, examples: [], sharePct: 20, theme: "Speed" }],
            window: { from: "2026-06-01", to: "2026-07-01" },
          },
          {
            competitor: "Wise",
            sampleSize: 100,
            store: "android",
            themes: [{ count: 12, examples: [], sharePct: 12, theme: "Fees" }],
            window: { from: "2026-06-01", to: "2026-07-01" },
          },
        ],
      },
      meta: { generatedAt: "2026-07-03T00:00:00.000Z" },
    };
    const html = renderToStaticMarkup(<ReviewPainRollup artifact={sparseThemeArtifact} />);

    expect(html).toContain("Speed");
    expect(html).toContain("10%");
    expect(html).toContain("n=20");
    expect(html).toContain("Fees");
    expect(html).toContain("6%");
    expect(html).toContain("n=12");
  });

  it("renders Google Trends as connector-needed manual upload", () => {
    const html = renderToStaticMarkup(<TrendsPanel />);

    expect(html).toContain("Search demand");
    expect(html).toContain("Google Trends API is alpha-limited");
    expect(findCopyViolations(html, "components/signals/TrendsPanel.tsx")).toEqual([]);
  });

  it("renders status KPI values with compact status styling", () => {
    const html = renderToStaticMarkup(
      <StatTile detail="manual CSV upload path" label="Trends" value="Connector needed" valueTone="status" />,
    );

    expect(html).toContain("stat-value-status");
  });

  it("leads the signals KPI strip with populated review evidence", () => {
    const html = renderToStaticMarkup(<SignalsPage />);
    const reviewIndex = html.indexOf("Review excerpts mined");
    const recentIndex = html.indexOf("Community threads");
    const creatorsIndex = html.indexOf("Creators identified");
    const geoIndex = html.indexOf("AI answers captured");

    expect(reviewIndex).toBeGreaterThanOrEqual(0);
    expect(reviewIndex).toBeLessThan(recentIndex);
    expect(recentIndex).toBeLessThan(creatorsIndex);
    expect(creatorsIndex).toBeLessThan(geoIndex);
    expect(html).not.toContain("pending access");
    expect(html).toContain("Content topics and reply angles");
    expect(html).toContain("Capture pending");
    expect(html).toContain("/playbook?market=31000US45940#messaging");
    expect(html).toContain("/playbook?market=31000US45940#content-seo");
    expect(html).not.toContain("0 of 0");
    expect(html).not.toContain("0 of 20");
    expect(html).not.toContain("US-based Indians");
    expect(html).toContain("24");
    expect(html).toContain("19 evidence-linked");
    expect(findCopyViolations(html, "app/signals/page.tsx")).toEqual([]);
  });

  it("does not render placeholder hrefs on the Signals page", () => {
    const html = renderToStaticMarkup(<SignalsPage />);
    const hrefs = [...html.matchAll(/<a[^>]+href="([^"]*)"/gu)].map((match) => match[1] ?? "");
    const placeholderHrefs = hrefs.filter((href) => (
      href === "" ||
      href === "#" ||
      href.startsWith("#") ||
      /^javascript:/iu.test(href) ||
      /example\.com|placeholder|todo/iu.test(href)
    ));

    expect(hrefs.length).toBeGreaterThan(0);
    expect(placeholderHrefs).toEqual([]);
  });
});
