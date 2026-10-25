/**
 * pipeline/xpat-ads/build-campaign-funnel.mjs
 *
 * Reads the Metabase CSV dump (online_campaign_signup_performance_12m.csv)
 * and builds a campaign-funnel.json artifact that joins:
 *   - Funnel metrics from CSV (signups → phone → US bank → Indian bank → first transfer)
 *   - Ad spend/performance from xpat-ad-performance.json (spend, CTR, CPC, impressions)
 *   - USD/INR exchange rate during campaign period from fx-history.json
 *
 * Joining strategy (utm_campaign can be a name OR a numeric campaign ID):
 *   1. Exact match → CSV key == ad campaign name
 *   2. Normalized match → both sides lowercased + non-alphanumeric → space
 *   3. Campaign ID match → numeric utm_campaign == platform campaignId
 *   4. Prefix match → one side starts with the other
 *
 * Usage:
 *   node pipeline/xpat-ads/build-campaign-funnel.mjs \
 *     --csv "D:/Infinitra Projects/xpat/online_campaign_signup_performance_12m.csv"
 *
 * Output: data/artifacts/campaign-funnel.json
 */

import { createReadStream } from "node:fs";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { writeDeterministicJsonPreservingArrays } from "../lib/provenance.mjs";

const ARTIFACT_PATH = join("data", "artifacts", "campaign-funnel.json");
const AD_PERF_PATH = join("data", "artifacts", "xpat-ad-performance.json");
const FX_HISTORY_PATH = join("data", "artifacts", "fx-history.json");

// ---------------------------------------------------------------------------
// FX rate lookup — build a date → rate map from fx-history.json
// ---------------------------------------------------------------------------

function buildFxLookup(fxArtifact) {
  const byDate = {};
  for (const entry of fxArtifact?.data?.rates ?? []) {
    if (entry.date && entry.rate) byDate[entry.date] = entry.rate;
  }
  return byDate;
}

/**
 * Computes average, min, max USD/INR rate between two dates (inclusive).
 * Returns null fields if no FX data covers the period.
 */
function fxRateForPeriod(fxByDate, dateFrom, dateTo) {
  if (!dateFrom) return { avgUsdInrRate: null, minUsdInrRate: null, maxUsdInrRate: null, fxDataPoints: 0 };

  const from = new Date(dateFrom);
  const to = new Date(dateTo || dateFrom);
  const rates = [];

  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    if (fxByDate[dateStr]) rates.push(fxByDate[dateStr]);
  }

  if (rates.length === 0) {
    return { avgUsdInrRate: null, minUsdInrRate: null, maxUsdInrRate: null, fxDataPoints: 0 };
  }

  const avg = rates.reduce((s, r) => s + r, 0) / rates.length;

  return {
    avgUsdInrRate: Math.round(avg * 100) / 100,
    minUsdInrRate: Math.round(Math.min(...rates) * 100) / 100,
    maxUsdInrRate: Math.round(Math.max(...rates) * 100) / 100,
    fxDataPoints: rates.length,
  };
}

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------

async function parseCsv(filePath) {
  const rows = [];
  const rl = createInterface({ input: createReadStream(filePath) });
  let headers = null;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const values = line.split(",");
    if (!headers) {
      headers = values.map((h) => h.trim());
      continue;
    }
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? "").trim();
    });
    rows.push(row);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Normalise a campaign name for fuzzy matching
// ---------------------------------------------------------------------------

function normalizeName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Build spend lookup from ad performance artifact
// Key: normalized campaign name OR campaign ID
// ---------------------------------------------------------------------------

function buildSpendLookup(adPerfArtifact) {
  const byNormalizedName = new Map();
  const byId = new Map();

  for (const record of adPerfArtifact.data.records) {
    const id = String(record.campaignId ?? "").trim();
    const name = normalizeName(record.campaignName);

    // Accumulate spend, clicks, impressions by campaign
    const addToMap = (map, key) => {
      if (!key) return;
      const existing = map.get(key) ?? {
        campaignId: id,
        campaignName: record.campaignName,
        platform: record.platform,
        spendUsd: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        dates: [],
        statuses: new Set(),
        lastDate: null,
      };
      existing.spendUsd += record.spendUsd ?? 0;
      existing.clicks += record.clicks ?? 0;
      existing.impressions += record.impressions ?? 0;
      existing.conversions += record.conversions ?? 0;
      if (record.date) existing.dates.push(record.date);
      if (record.status) existing.statuses.add(record.status);
      if (record.date && (!existing.lastDate || record.date > existing.lastDate)) {
        existing.lastDate = record.date;
      }
      map.set(key, existing);
    };

    // Store under both exact name AND normalized name so both lookup paths work
    const exactName = record.campaignName?.trim() ?? "";
    if (exactName) addToMap(byNormalizedName, exactName);  // exact key
    if (name && name !== exactName) addToMap(byNormalizedName, name); // normalized key
    if (id) addToMap(byId, id);
  }

  // Compute derived metrics and determine active status
  // A campaign is "active" if any record had ENABLED/ACTIVE status
  // within the last 30 days of the artifact's date range
  const finalize = (entry) => {
    const ctr = entry.impressions > 0
      ? Math.round((entry.clicks / entry.impressions) * 10000) / 100
      : null;
    const cpc = entry.clicks > 0
      ? Math.round((entry.spendUsd / entry.clicks) * 100) / 100
      : null;
    const dates = entry.dates.sort();
    // Active = had ENABLED status; recently paused = last date within 15 days of artifact end
    const hasEnabled = entry.statuses.has("ENABLED") || entry.statuses.has("ACTIVE");
    const artifactEndDate = dates.at(-1) ?? "";
    const isRecentlyPaused = entry.lastDate && artifactEndDate &&
      (new Date(artifactEndDate) - new Date(entry.lastDate)) <= 15 * 24 * 60 * 60 * 1000;
    const isActive = hasEnabled || isRecentlyPaused;
    const campaignStatus = hasEnabled ? "active" : (isRecentlyPaused ? "recently_paused" : "paused");

    return {
      ...entry,
      spendUsd: Math.round(entry.spendUsd * 100) / 100,
      ctr,
      cpc,
      dateFrom: dates[0] ?? null,
      dateTo: dates.at(-1) ?? null,
      isActive,
      campaignStatus,
      dates: undefined,
      statuses: undefined,
    };
  };

  for (const [key, val] of byNormalizedName) byNormalizedName.set(key, finalize(val));
  for (const [key, val] of byId) byId.set(key, finalize(val));

  return { byNormalizedName, byId };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  // Resolve CSV path from --csv arg or default
  const csvArgIndex = process.argv.indexOf("--csv");
  const csvPath = csvArgIndex !== -1
    ? process.argv[csvArgIndex + 1]
    : join("D:", "Infinitra Projects", "xpat", "online_campaign_signup_performance_12m.csv");

  if (!existsSync(csvPath)) {
    console.error(`[funnel] CSV not found: ${csvPath}`);
    console.error(`[funnel] Usage: node pipeline/xpat-ads/build-campaign-funnel.mjs --csv <path>`);
    process.exit(1);
  }

  if (!existsSync(AD_PERF_PATH)) {
    console.error(`[funnel] Ad performance artifact not found: ${AD_PERF_PATH}`);
    process.exit(1);
  }

  console.log("[funnel] Reading CSV...");
  const rows = await parseCsv(csvPath);
  console.log(`[funnel] ${rows.length} user rows loaded`);

  const adPerfArtifact = JSON.parse(readFileSync(AD_PERF_PATH, "utf8"));
  const { byNormalizedName, byId } = buildSpendLookup(adPerfArtifact);
  console.log(`[funnel] Ad performance lookup: ${byNormalizedName.size} campaign names, ${byId.size} campaign IDs`);

  // Load FX rate history
  const fxArtifact = existsSync(FX_HISTORY_PATH)
    ? JSON.parse(readFileSync(FX_HISTORY_PATH, "utf8"))
    : null;
  const fxByDate = fxArtifact ? buildFxLookup(fxArtifact) : {};
  console.log(`[funnel] FX rate lookup: ${Object.keys(fxByDate).length} daily USD/INR rates loaded`);

  // ---------------------------------------------------------------------------
  // Group CSV rows by utm_campaign_normalized
  // ---------------------------------------------------------------------------

  const groups = new Map();

  for (const row of rows) {
    // Use normalized key for grouping (cleaner, deduped)
    const groupKey = row.utm_campaign_normalized || normalizeName(row.utm_campaign) || "(none)";
    const rawCampaign = row.utm_campaign || "";

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        utmCampaignNormalized: groupKey,
        utmCampaignRaw: new Set(),
        utmSources: new Set(),
        utmMediums: new Set(),
        signups: 0,
        phoneVerified: 0,
        usBankAdded: 0,
        indianBankAdded: 0,
        completedFirstTransfer: 0,
        devices: new Set(),
        platforms: new Set(),
        signupDates: [],
        firstTransferDates: [],
      });
    }

    const g = groups.get(groupKey);
    g.utmCampaignRaw.add(rawCampaign);
    g.utmSources.add(row.utm_source || "");
    g.utmMediums.add(row.utm_medium || "");
    g.signups++;
    if (row.phone_status === "added_verified") g.phoneVerified++;
    if (row.us_bank_added === "Y") g.usBankAdded++;
    if (row.indian_bank_added === "Y") g.indianBankAdded++;
    if (row.completed_first_transfer === "Y") {
      g.completedFirstTransfer++;
      if (row.first_transfer_date) g.firstTransferDates.push(row.first_transfer_date);
    }
    if (row.device_type) g.devices.add(row.device_type);
    if (row.platform) g.platforms.add(row.platform);
    if (row.signup_date) g.signupDates.push(row.signup_date);
  }

  // ---------------------------------------------------------------------------
  // Verified UTM → Google Ads campaign ID overrides
  //
  // These mappings are extracted from the `gad_campaignid` parameter that
  // Google automatically appends to every ad click URL. This is a Google-issued
  // parameter — it cannot be wrong. It is the only reliable way to map
  // abbreviated/non-matching utm_campaign values to their Google Ads campaign.
  //
  // How to re-derive: extract gad_campaignid from landing_page column in CSV.
  // Do NOT guess based on date overlap or naming similarity alone.
  //
  // Note: some UTM values are aliases for the same campaign ID (e.g. ga-edm
  // and edm_search_brand_260526 both map to 23875790790). The funnel builder
  // will merge them if they group to different keys — that is expected.
  //
  // Last verified: 2026-09-28 from online_campaign_signup_performance_12m.csv
  // ---------------------------------------------------------------------------

  const UTM_CAMPAIGN_ID_OVERRIDES = {
    // utm_campaign_normalized  => gad_campaignid (verified from Google click URL)
    "searchi":                    "23867726121", // Search Ads | Intent | May 2026
    "ga-gs--gste":                "24156745636", // Generic Search _ 19 Aug 2026
    "ga-comp":                    "24127354718", // Comp Brand Ads | 12 Aug 2026
    "ga-edm":                     "23875790790", // EDM_Search_Brand_260526 (alias)
    "ga-si-aplriwi":              "23867726121", // Search Ads | Intent | May 2026 (alias)
    "ga-si-intr":                 "23867726121", // Search Ads | Intent | May 2026 (alias)
    "si-bmtwc":                   "23867726121", // Search Ads | Intent | May 2026 (alias)
    "ga-pmax-2k-tc":              "24184186488", // $2K TC Pmax (verified)
    "ga_smui_u_i_02_june_2026":   "23992630973", // Search Intent_India_USA to India_02 June 2026
    "aoj_mv_campaign":            "23462393439", // verified from gad_campaignid
    "msg_campaign":               "23415007655", // verified from gad_campaignid
  };

  // ---------------------------------------------------------------------------
  // Join with ad performance and compute rates
  // ---------------------------------------------------------------------------

  const campaigns = [];
  let joined = 0;
  let unmatched = 0;

  for (const [key, g] of groups) {
    // Join strategy (in priority order):
    // 0. Manual override — utm value is an abbreviation known not to match automatically
    // 1. Exact match — CSV key == ad campaign name (no transformation)
    // 2. Normalized match — both sides lowercased + non-alphanumeric → space
    // 3. Campaign ID match — raw CSV value is a numeric platform campaign ID
    // 4. Prefix match — one side starts with the other (handles suffix differences)

    let adData = null;
    let joinMethod = null;

    // 0. Manual override
    const overrideId = UTM_CAMPAIGN_ID_OVERRIDES[key];
    if (overrideId) {
      adData = byId.get(overrideId) ?? null;
      if (adData) joinMethod = "manual";
    }

    if (!adData) {
      adData = byNormalizedName.get(key) ?? null; // try exact key as-is first
      if (adData) joinMethod = "exact";
    }

    if (!adData) {
      // Normalized match
      const normKey = normalizeName(key);
      adData = byNormalizedName.get(normKey) ?? null;
      if (adData) joinMethod = "name";
    }

    if (!adData) {
      // Campaign ID match — raw utm_campaign is a numeric platform ID
      for (const rawVal of g.utmCampaignRaw) {
        const candidate = byId.get(rawVal);
        if (candidate) {
          adData = candidate;
          joinMethod = "id";
          break;
        }
      }
    }

    if (!adData) {
      // Prefix match — handles cases like "st generic search jan28" vs "st generic search jan28 new"
      const normKey = normalizeName(key);
      for (const [adKey, adVal] of byNormalizedName) {
        if (adKey.startsWith(normKey) || normKey.startsWith(adKey)) {
          adData = adVal;
          joinMethod = "prefix";
          break;
        }
      }
    }

    if (adData) joined++;
    else unmatched++;

    const signupDates = g.signupDates.sort();
    const pct = (n) => g.signups > 0 ? Math.round((n / g.signups) * 1000) / 10 : null;

    campaigns.push({
      utmCampaignNormalized: key,
      utmCampaignRaw: [...g.utmCampaignRaw].filter(Boolean).sort(),
      utmSources: [...g.utmSources].filter(Boolean).sort(),
      utmMediums: [...g.utmMediums].filter(Boolean).sort(),

      // Funnel counts
      signups: g.signups,
      phoneVerified: g.phoneVerified,
      usBankAdded: g.usBankAdded,
      indianBankAdded: g.indianBankAdded,
      completedFirstTransfer: g.completedFirstTransfer,

      // Funnel rates (%)
      phoneVerifiedRate: pct(g.phoneVerified),
      usBankAddedRate: pct(g.usBankAdded),
      indianBankAddedRate: pct(g.indianBankAdded),
      transferRate: pct(g.completedFirstTransfer),

      // Date range from CSV
      signupDateFrom: signupDates[0] ?? null,
      signupDateTo: signupDates.at(-1) ?? null,

      // Device/platform breakdown
      devices: [...g.devices].filter(Boolean).sort(),
      platforms: [...g.platforms].filter(Boolean).sort(),

      // Ad performance (null if no match)
      adJoinMethod: joinMethod,
      adCampaignId: adData?.campaignId ?? null,
      adCampaignName: adData?.campaignName ?? null,
      adPlatform: adData?.platform ?? null,
      spendUsd: adData?.spendUsd ?? null,
      clicks: adData?.clicks ?? null,
      impressions: adData?.impressions ?? null,
      ctr: adData?.ctr ?? null,
      cpc: adData?.cpc ?? null,
      adDateFrom: adData?.dateFrom ?? null,
      adDateTo: adData?.dateTo ?? null,

      // Derived: cost per outcome (null if no spend data)
      costPerSignup: adData?.spendUsd && g.signups > 0
        ? Math.round((adData.spendUsd / g.signups) * 100) / 100 : null,
      costPerTransfer: adData?.spendUsd && g.completedFirstTransfer > 0
        ? Math.round((adData.spendUsd / g.completedFirstTransfer) * 100) / 100 : null,

      // USD/INR exchange rate during campaign period (from fx-history.json)
      // Higher rate = NRIs more motivated to transfer (more INR per dollar)
      // Low rate during campaign = possible reason for low CTR or low transfer rate
      ...fxRateForPeriod(fxByDate, adData?.dateFrom ?? signupDates[0], adData?.dateTo ?? signupDates.at(-1)),
    });
  }

  // Sort by signups descending
  campaigns.sort((a, b) => b.signups - a.signups);

  // Overall funnel benchmarks
  const totalSignups = campaigns.reduce((s, c) => s + c.signups, 0);
  const totalTransfers = campaigns.reduce((s, c) => s + c.completedFirstTransfer, 0);
  const totalSpend = campaigns.reduce((s, c) => s + (c.spendUsd ?? 0), 0);

  const artifact = {
    meta: {
      family: "campaign-funnel",
      source: "Metabase CSV dump (online_campaign_signup_performance_12m.csv) joined with xpat-ad-performance.json",
      generatedAt: new Date().toISOString(),
      csvPath,
      rowsInCsv: rows.length,
      campaignCount: campaigns.length,
      joinedWithAdPerf: joined,
      unmatchedCampaigns: unmatched,
      provenance: "snapshot",
      version: 1,
      caveats: [
        "utm_campaign_normalized is the primary grouping key — use this for analysis, not utm_campaign.",
        "Campaign ID 22058403586 is XPAT's second-largest campaign (1,042 users) but appears only as a Google Ads ID — name mapping pending.",
        "IP, device, platform data only complete from mid-February 2026 onwards.",
        "landing_page truncated at 200 chars — use utm_* columns for attribution.",
        "Ad spend data joined on best-effort name/ID match — some campaigns may have partial or no spend data.",
        "Transfer rate = completed_first_transfer / signups. Both legs of transfer must have settled.",
      ],
    },
    data: {
      benchmarks: {
        totalSignups,
        totalTransfers,
        totalSpendUsd: Math.round(totalSpend * 100) / 100,
        avgPhoneVerifiedRate: Math.round(campaigns.reduce((s, c) => s + (c.phoneVerifiedRate ?? 0), 0) / campaigns.length * 10) / 10,
        avgUsBankAddedRate: Math.round(campaigns.reduce((s, c) => s + (c.usBankAddedRate ?? 0), 0) / campaigns.length * 10) / 10,
        avgTransferRate: Math.round(campaigns.reduce((s, c) => s + (c.transferRate ?? 0), 0) / campaigns.length * 10) / 10,
        overallTransferRate: Math.round((totalTransfers / totalSignups) * 1000) / 10,
      },
      campaigns,
    },
  };

  await writeDeterministicJsonPreservingArrays(ARTIFACT_PATH, artifact);

  console.log(`\n[funnel] ✓ Written to ${ARTIFACT_PATH}`);
  console.log(`[funnel] ${campaigns.length} campaigns | ${joined} joined with ad spend | ${unmatched} funnel-only`);
  console.log(`[funnel] Overall: ${totalSignups} signups → ${totalTransfers} transfers (${(totalTransfers/totalSignups*100).toFixed(1)}%)`);
  console.log(`[funnel] Top 5 campaigns by signups:`);
  campaigns.slice(0, 5).forEach((c) => {
    console.log(`  ${c.utmCampaignNormalized.padEnd(40)} ${c.signups} signups, ${c.transferRate}% transfer rate, spend: $${c.spendUsd ?? "n/a"}`);
  });
}

await run();
