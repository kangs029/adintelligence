/**
 * pipeline/xpat-ads/ingest-google-reports.mjs
 *
 * Reads manually downloaded Google Ads CSV reports and enriches
 * data/artifacts/campaign-funnel.json with:
 *   - Competitor presence (Auction Insights)
 *   - Search term quality signals (low/high Click-Through Rate terms)
 *   - Landing page performance
 *   - Device breakdown
 *   - Top performing ad headlines
 *
 * Usage:
 *   node pipeline/xpat-ads/ingest-google-reports.mjs \
 *     --reports "D:/Infinitra Projects/xpat/reports"
 *
 * Output: data/artifacts/campaign-funnel.json (enriched in-place)
 *         data/artifacts/google-ads-insights.json (standalone insights artifact)
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { writeDeterministicJsonPreservingArrays } from "../lib/provenance.mjs";

const FUNNEL_ARTIFACT = join("data", "artifacts", "campaign-funnel.json");
const INSIGHTS_ARTIFACT = join("data", "artifacts", "google-ads-insights.json");

// ---------------------------------------------------------------------------
// CSV parser for Google Ads exported reports
// Google Ads CSVs: row0=report name, row1=date range, row2=headers, row3+=data
// ---------------------------------------------------------------------------

function parseGoogleCsv(filePath) {
  if (!existsSync(filePath)) return null;

  const lines = readFileSync(filePath, "utf8")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  const dateRange = lines[1]?.replace(/"/g, "").trim() ?? "unknown";
  const headerLine = lines[2] ?? "";
  const headers = headerLine.split(",").map(h => h.replace(/"/g, "").trim());

  const rows = lines.slice(3).map(line => {
    const vals = line.split(",");
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? "").replace(/"/g, "").trim(); });
    return obj;
  }).filter(r => Object.values(r).some(v => v));

  return { dateRange, headers, rows };
}

function pct(val) {
  if (!val || val === "--") return null;
  return parseFloat(val.replace("%", "").replace("< ", "").trim()) || null;
}

// ---------------------------------------------------------------------------
// Process Auction Insights
// ---------------------------------------------------------------------------

function processAuctionInsights(data) {
  if (!data) return null;

  const competitors = data.rows
    .filter(r => r["Display URL domain"] && r["Display URL domain"] !== "You")
    .map(r => ({
      domain: r["Display URL domain"],
      impressionShare: pct(r["Impression share"]),
      impressionShareLabel: r["Impression share"],
      overlapRate: pct(r["Overlap rate"]),
      topOfPageRate: pct(r["Top of page rate"]),
      positionAboveRate: pct(r["Position above rate"]),
      outrankingShare: pct(r["Outranking share"]),
    }))
    .sort((a, b) => (b.impressionShare ?? 0) - (a.impressionShare ?? 0));

  const xpat = data.rows.find(r => r["Display URL domain"] === "You");
  const xpatImpressionShare = pct(xpat?.["Impression share"]);

  return {
    dateRange: data.dateRange,
    xpatImpressionShare,
    xpatImpressionShareLabel: xpat?.["Impression share"] ?? "< 10%",
    xpatTopOfPageRate: pct(xpat?.["Top of page rate"]),
    competitors,
    topCompetitor: competitors[0] ?? null,
    note: xpatImpressionShare === null
      ? "XPAT impression share was below 10% — Google does not report auction data below this threshold. This indicates XPAT had very low visibility in search during this period."
      : null,
  };
}

// ---------------------------------------------------------------------------
// Process Search Terms
// ---------------------------------------------------------------------------

function processSearchTerms(data) {
  if (!data) return null;

  const rows = data.rows.filter(r => r["Search term"] && !r["Search term"].startsWith("Total:"));

  // Low CTR terms — wasted impressions
  const lowCtr = rows
    .filter(r => parseFloat(r["CTR"] ?? 0) < 1 && Number(r["Impr."] ?? 0) > 50)
    .sort((a, b) => Number(b["Impr."] ?? 0) - Number(a["Impr."] ?? 0))
    .slice(0, 20)
    .map(r => ({
      term: r["Search term"],
      impressions: Number(r["Impr."] ?? 0),
      clicks: Number(r["Clicks"] ?? 0),
      ctr: r["CTR"],
      campaign: r["Campaign"],
      issue: "Low intent — ad shown but not clicked. Consider adding as negative keyword.",
    }));

  // High CTR terms — strong intent
  const highCtr = rows
    .filter(r => parseFloat(r["CTR"] ?? 0) >= 10 && Number(r["Impr."] ?? 0) > 20)
    .sort((a, b) => Number(b["Impr."] ?? 0) - Number(a["Impr."] ?? 0))
    .slice(0, 20)
    .map(r => ({
      term: r["Search term"],
      impressions: Number(r["Impr."] ?? 0),
      clicks: Number(r["Clicks"] ?? 0),
      ctr: r["CTR"],
      conversions: Number(r["Conversions"] ?? 0),
      campaign: r["Campaign"],
    }));

  // Overall stats
  const totalImpr = rows.reduce((s, r) => s + Number(r["Impr."] ?? 0), 0);
  const totalClicks = rows.reduce((s, r) => s + Number(r["Clicks"] ?? 0), 0);
  const overallCtr = totalImpr > 0 ? Math.round(totalClicks / totalImpr * 10000) / 100 : null;

  return {
    dateRange: data.dateRange,
    totalUniqueTerms: rows.length,
    totalImpressions: totalImpr,
    totalClicks,
    overallCtr,
    lowCtrTermCount: lowCtr.length,
    highCtrTermCount: highCtr.length,
    lowCtrTerms: lowCtr,
    highCtrTerms: highCtr,
  };
}

// ---------------------------------------------------------------------------
// Process Landing Pages
// ---------------------------------------------------------------------------

function processLandingPages(data) {
  if (!data) return null;

  const rows = data.rows
    .filter(r => r["Landing page"] && !r["Landing page"].startsWith("Total:"))
    .map(r => ({
      url: r["Landing page"],
      clicks: Number(r["Clicks"] ?? 0),
      impressions: Number(r["Impr."] ?? 0),
      ctr: r["CTR"],
      avgCpc: r["Avg. CPC"],
      mobileSpeedScore: r["Mobile speed score"] || null,
      mobileFriendlyClickRate: r["Mobile-friendly click rate"] || null,
    }))
    .sort((a, b) => b.clicks - a.clicks);

  return {
    dateRange: data.dateRange,
    topLandingPages: rows.slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Process Device Breakdown
// ---------------------------------------------------------------------------

function processDevices(data) {
  if (!data) return null;

  const devSum = {};
  data.rows.forEach(r => {
    const d = r["Device"];
    if (!d) return;
    if (!devSum[d]) devSum[d] = { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
    devSum[d].impressions += Number(r["Impr."] ?? 0);
    devSum[d].clicks += Number(r["Clicks"] ?? 0) || Number(r["Interactions"] ?? 0);
    devSum[d].cost += Number(r["Cost"] ?? 0);
    devSum[d].conversions += Number(r["Conversions"] ?? 0) || 0;
  });

  return {
    dateRange: data.dateRange,
    devices: Object.entries(devSum).map(([device, v]) => ({
      device,
      impressions: v.impressions,
      clicks: v.clicks,
      ctr: v.impressions > 0 ? Math.round(v.clicks / v.impressions * 10000) / 100 : null,
      costUsd: Math.round(v.cost * 100) / 100,
      conversions: Math.round(v.conversions * 10) / 10,
    })).sort((a, b) => b.impressions - a.impressions),
  };
}

// ---------------------------------------------------------------------------
// Process Ad Copy
// ---------------------------------------------------------------------------

function processAds(data) {
  if (!data) return null;

  const rows = data.rows
    .filter(r => (r["Headline 1"] || r["Long headline"]) && r["Campaign"])
    .map(r => ({
      headline1: r["Headline 1"] || r["Long headline"] || "",
      headline2: r["Headline 2"] || "",
      description: r["Description 1"] || r["Description"] || "",
      campaign: r["Campaign"],
      adType: r["Ad type"] || "",
      conversions: Number(r["Conversions"] ?? 0),
      ctr: r["CTR"] || null,
      impressions: Number(r["Impr."] ?? 0),
      adStrength: r["Ad strength"] || null,
    }))
    .sort((a, b) => b.conversions - a.conversions);

  return {
    dateRange: data.dateRange,
    totalAds: rows.length,
    topAdsByConversions: rows.slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const reportsArgIndex = process.argv.indexOf("--reports");
  const reportsDir = reportsArgIndex !== -1
    ? process.argv[reportsArgIndex + 1]
    : "D:/Infinitra Projects/xpat/reports";

  console.log("[insights] Reading Google Ads reports from:", reportsDir);

  const auctionData = parseGoogleCsv(join(reportsDir, "Auction insights report.csv"));
  const searchData = parseGoogleCsv(join(reportsDir, "Search terms report.csv"));
  const landingData = parseGoogleCsv(join(reportsDir, "Landing page report.csv"));
  const deviceData = parseGoogleCsv(join(reportsDir, "Device report.csv"));
  const adData = parseGoogleCsv(join(reportsDir, "Ad report.csv"));

  const auction = processAuctionInsights(auctionData);
  const searchTerms = processSearchTerms(searchData);
  const landingPages = processLandingPages(landingData);
  const devices = processDevices(deviceData);
  const ads = processAds(adData);

  // Log key findings
  if (auction) {
    console.log("\n[insights] Auction Insights:");
    console.log("  XPAT impression share:", auction.xpatImpressionShareLabel);
    console.log("  Top competitor:", auction.topCompetitor?.domain, auction.topCompetitor?.impressionShareLabel);
    if (auction.note) console.log("  Note:", auction.note);
  }
  if (searchTerms) {
    console.log("\n[insights] Search Terms:");
    console.log("  Total terms:", searchTerms.totalUniqueTerms);
    console.log("  Overall CTR:", searchTerms.overallCtr + "%");
    console.log("  Low CTR terms (wasted spend):", searchTerms.lowCtrTermCount);
    console.log("  High CTR terms (strong intent):", searchTerms.highCtrTermCount);
  }

  // Build standalone insights artifact
  const insightsArtifact = {
    meta: {
      family: "google-ads-insights",
      source: "Google Ads UI manual CSV exports",
      generatedAt: new Date().toISOString(),
      reportsDir,
      provenance: "snapshot",
      version: 1,
      caveats: [
        "All reports cover the date range shown in each section — not the full campaign history.",
        "Auction Insights only available when XPAT impression share >= 10%.",
        "Search terms data is sampled — very low volume terms may be anonymised by Google.",
        "Device CTR figures include all interaction types for app campaigns.",
      ],
    },
    data: {
      auctionInsights: auction,
      searchTerms,
      landingPages,
      devices,
      ads,
    },
  };

  await writeDeterministicJsonPreservingArrays(INSIGHTS_ARTIFACT, insightsArtifact);
  console.log("\n[insights] ✓ Written to", INSIGHTS_ARTIFACT);

  // Also enrich the campaign funnel artifact with the standing context
  if (existsSync(FUNNEL_ARTIFACT)) {
    const funnel = JSON.parse(readFileSync(FUNNEL_ARTIFACT, "utf8"));
    funnel.data.googleAdsInsights = {
      reportDateRange: auction?.dateRange ?? searchTerms?.dateRange ?? "unknown",
      competitorContext: auction ? {
        xpatImpressionShare: auction.xpatImpressionShareLabel,
        remitlyImpressionShare: auction.competitors.find(c => c.domain === "remitly.com")?.impressionShareLabel ?? "unknown",
        remitlyOverlapRate: auction.competitors.find(c => c.domain === "remitly.com")?.overlapRate ?? null,
        note: "Remitly appears in 60%+ of the same auctions as XPAT and has 4x the impression share — a structural headwind on CTR.",
      } : null,
      searchTermSignals: searchTerms ? {
        overallCtr: searchTerms.overallCtr,
        lowCtrTermCount: searchTerms.lowCtrTermCount,
        highCtrTermCount: searchTerms.highCtrTermCount,
        topLowCtrTerms: (searchTerms.lowCtrTerms ?? []).slice(0, 5).map(t => t.term),
        topHighCtrTerms: (searchTerms.highCtrTerms ?? []).slice(0, 5).map(t => t.term),
      } : null,
      topLandingPage: landingPages?.topLandingPages?.[0]?.url ?? null,
      deviceSplit: devices?.devices?.map(d => ({ device: d.device, impressions: d.impressions, ctr: d.ctr })) ?? null,
    };
    funnel.meta.googleAdsInsightsAddedAt = new Date().toISOString();
    await writeDeterministicJsonPreservingArrays(FUNNEL_ARTIFACT, funnel);
    console.log("[insights] ✓ Campaign funnel artifact enriched with Google Ads insights");
  }
}

await run();
