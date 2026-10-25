const META_BASE_URL = "https://graph.facebook.com/v20.0";

export const META_INSIGHTS_FIELDS = [
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "spend",
  "impressions",
  "clicks",
  "reach",
  "ctr",
  "cpc",
  "cpm",
  "objective",
  "actions",
  "cost_per_action_type",
].join(",");

export function metaInsightsUrl({ adAccountId, datePreset = "last_30d" }) {
  const url = new URL(`${META_BASE_URL}/${adAccountId}/insights`);
  url.searchParams.set("fields", META_INSIGHTS_FIELDS);
  url.searchParams.set("date_preset", datePreset);
  url.searchParams.set("level", "adset");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("limit", "500");
  return url.toString();
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function parseFloat2(value) {
  const parsed = parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function parseInteger(value) {
  const parsed = parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractConversions(actions) {
  if (!Array.isArray(actions)) return null;
  const conv = actions.find(
    (action) =>
      action.action_type === "offsite_conversion.fb_pixel_purchase" ||
      action.action_type === "omni_purchase" ||
      action.action_type === "offsite_conversion",
  );
  return conv ? parseInteger(conv.value) : null;
}

function extractCpa(costPerActionType) {
  if (!Array.isArray(costPerActionType)) return null;
  const conv = costPerActionType.find(
    (action) =>
      action.action_type === "offsite_conversion.fb_pixel_purchase" ||
      action.action_type === "omni_purchase" ||
      action.action_type === "offsite_conversion",
  );
  return conv ? parseFloat2(conv.value) : null;
}

export function normalizeMetaRecord({ capturedAt, row }) {
  if (!row?.campaign_id || !row?.date_start) return undefined;

  const spendUsd = parseFloat2(row.spend);
  if (spendUsd === null || spendUsd < 0) return undefined;

  return {
    adSetId: cleanText(row.adset_id) || null,
    adSetName: cleanText(row.adset_name) || null,
    campaignId: cleanText(row.campaign_id),
    campaignName: cleanText(row.campaign_name) || null,
    capturedAt,
    clicks: parseInteger(row.clicks),
    conversions: extractConversions(row.actions),
    cpa: extractCpa(row.cost_per_action_type),
    cpc: parseFloat2(row.cpc),
    cpm: parseFloat2(row.cpm),
    ctr: parseFloat2(row.ctr),
    date: row.date_start,
    geoId: null,
    geoName: null,
    impressions: parseInteger(row.impressions),
    objective: cleanText(row.objective) || null,
    platform: "Meta",
    reach: parseInteger(row.reach) || null,
    spendUsd,
    status: "ACTIVE",
  };
}

export function buildMetaArtifact({
  capturedAt = new Date().toISOString(),
  records,
  status = "ok",
  errors = [],
  adAccountId,
}) {
  const validRecords = records.filter(Boolean);
  const blocked = status !== "ok";

  return {
    meta: {
      caveats: [
        "Spend and impressions are reported by Meta and may differ from billed amounts by up to 1%.",
        "Conversions are Meta-attributed using their default 7-day click, 1-day view window.",
        "Geographic data is not available at the campaign level from this endpoint.",
      ],
      family: "meta-ad-performance",
      generatedAt: capturedAt,
      method:
        "Authenticated read-only pull from XPAT Meta ad account insights API at adset + daily level.",
      provenance: blocked ? "connector-needed" : "live",
      refreshCadence: "every 6 hours",
      source: `Meta Marketing API v20.0 — Ad Account ${adAccountId}`,
      version: 1,
    },
    data: {
      adAccountId,
      errors,
      recordCount: validRecords.length,
      records: validRecords,
      status,
    },
  };
}

export async function fetchMetaInsights({
  accessToken = process.env.META_ACCESS_TOKEN,
  adAccountId = process.env.META_AD_ACCOUNT_ID,
  datePreset = "last_30d",
  fetchImpl = fetch,
} = {}) {
  if (!accessToken || !adAccountId) {
    return {
      errors: [
        {
          message:
            "META_ACCESS_TOKEN or META_AD_ACCOUNT_ID is not configured.",
        },
      ],
      rows: [],
      status: "blocked",
    };
  }

  const url = metaInsightsUrl({ adAccountId, datePreset });
  const allRows = [];
  let nextUrl = url;
  let pageCount = 0;
  const MAX_PAGES = 20;

  try {
    while (nextUrl && pageCount < MAX_PAGES) {
      const separator = nextUrl.includes("?") ? "&" : "?";
      const pageUrl = `${nextUrl}${separator}access_token=${encodeURIComponent(accessToken)}`;
      const response = await fetchImpl(pageUrl);

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return {
          errors: [
            {
              message: `Meta API returned HTTP ${response.status}.`,
              body: body.slice(0, 500),
            },
          ],
          rows: allRows,
          status: "error",
        };
      }

      const json = await response.json();

      if (json.error) {
        return {
          errors: [
            {
              code: json.error.code,
              message: json.error.message ?? "Unknown Meta API error.",
              type: json.error.type,
            },
          ],
          rows: allRows,
          status: "error",
        };
      }

      allRows.push(...(json.data ?? []));
      nextUrl = json.paging?.next ?? null;
      pageCount += 1;
    }

    return { errors: [], rows: allRows, status: "ok" };
  } catch (error) {
    return {
      errors: [
        {
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      rows: allRows,
      status: "error",
    };
  }
}

/**
 * Saves the raw Meta API rows to S3 before normalization.
 * Key pattern: meta/YYYY-MM-DD/raw.json
 *
 * @param {object} opts
 * @param {object} opts.s3Client  - AWS SDK S3Client instance
 * @param {string} opts.bucket    - S3 bucket name
 * @param {string} opts.capturedAt - ISO timestamp used to derive the date key
 * @param {Array}  opts.rows      - Raw API rows from fetchMetaInsights
 */
async function saveRawToS3({ s3Client, bucket, capturedAt, rows }) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const date = capturedAt.slice(0, 10);
  const key = `meta/${date}/raw.json`;
  const body = JSON.stringify({ capturedAt, rowCount: rows.length, rows }, null, 2);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/json",
    }),
  );
  console.log(`[meta-performance] Raw response saved to s3://${bucket}/${key} (${rows.length} rows)`);
}

export async function runMetaPerformance({
  accessToken = process.env.META_ACCESS_TOKEN,
  adAccountId = process.env.META_AD_ACCOUNT_ID,
  capturedAt = new Date().toISOString(),
  datePreset = "maximum",
  fetchImpl = fetch,
  // Optional: pass an S3Client and bucket name to save raw API response before normalizing.
  s3Client = null,
  rawBucket = null,
} = {}) {
  const result = await fetchMetaInsights({
    accessToken,
    adAccountId,
    datePreset,
    fetchImpl,
  });

  // Save raw rows to S3 when running in AWS context.
  if (s3Client && rawBucket && result.rows.length > 0) {
    await saveRawToS3({ s3Client, bucket: rawBucket, capturedAt, rows: result.rows });
  }

  const records = result.rows.map((row) =>
    normalizeMetaRecord({ capturedAt, row }),
  );

  return buildMetaArtifact({
    adAccountId: adAccountId ?? "unknown",
    capturedAt,
    errors: result.errors,
    records,
    status: result.status,
  });
}
