const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v25";

function buildGoogleAdsQuery() {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      ad_group.id,
      ad_group.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.average_cpm,
      metrics.conversions,
      metrics.cost_per_conversion,
      segments.date
    FROM ad_group
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND metrics.impressions > 0
    ORDER BY segments.date DESC
    LIMIT 10000
  `.trim();
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function microsToDollars(micros) {
  if (micros === undefined || micros === null) return null;
  const val = Number(micros);
  if (!Number.isFinite(val)) return null;
  return Math.round((val / 1_000_000) * 100) / 100;
}

function parseFloat2(value) {
  const parsed = parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function parseInteger(value) {
  const parsed = parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function googleCampaignStatus(status) {
  if (status === "ENABLED") return "ACTIVE";
  if (status === "PAUSED") return "PAUSED";
  return "ARCHIVED";
}

export function normalizeGoogleRecord({ capturedAt, row }) {
  // Google Ads REST API v25 returns camelCase field names
  const campaignId = cleanText(row?.campaign?.id);
  const date = cleanText(row?.segments?.date);

  if (!campaignId || !date) return undefined;

  const spendUsd = microsToDollars(row?.metrics?.costMicros);
  if (spendUsd === null || spendUsd < 0) return undefined;

  return {
    adSetId: cleanText(row?.adGroup?.id) || null,
    adSetName: cleanText(row?.adGroup?.name) || null,
    campaignId,
    campaignName: cleanText(row?.campaign?.name) || null,
    capturedAt,
    clicks: parseInteger(row?.metrics?.clicks),
    conversions: parseFloat2(row?.metrics?.conversions),
    cpa: microsToDollars(row?.metrics?.costPerConversion),
    cpc: microsToDollars(row?.metrics?.averageCpc),
    cpm: microsToDollars(row?.metrics?.averageCpm),
    ctr: parseFloat2(row?.metrics?.ctr ? row.metrics.ctr * 100 : null),
    date,
    geoId: null,
    geoName: null,
    impressions: parseInteger(row?.metrics?.impressions),
    objective: cleanText(row?.campaign?.advertisingChannelType) || null,
    platform: "Google",
    reach: null,
    spendUsd,
    status: googleCampaignStatus(row?.campaign?.status),
  };
}

export function buildGoogleArtifact({
  capturedAt = new Date().toISOString(),
  records,
  status = "ok",
  errors = [],
  customerId,
}) {
  const validRecords = records.filter(Boolean);
  const blocked = status !== "ok";

  return {
    meta: {
      caveats: [
        "Cost values are converted from micros (divide by 1,000,000) and may differ by rounding.",
        "Conversions are Google Ads attributed using their default conversion windows.",
        "Geographic data is not available at the ad group level from this endpoint.",
        "CTR is expressed as a percentage (0-100), not a decimal.",
      ],
      family: "google-ad-performance",
      generatedAt: capturedAt,
      method:
        "Authenticated read-only pull from XPAT Google Ads account via GoogleAds API v17 search query at ad group + daily level.",
      provenance: blocked ? "connector-needed" : "live",
      refreshCadence: "every 6 hours",
      source: `Google Ads API v17 — Customer ${customerId}`,
      version: 1,
    },
    data: {
      customerId,
      errors,
      query: buildGoogleAdsQuery(),
      recordCount: validRecords.length,
      records: validRecords,
      status,
    },
  };
}

async function getGoogleAccessToken({
  clientId = process.env.GOOGLE_ADS_CLIENT_ID,
  clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET,
  refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Google token refresh returned HTTP ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  const json = await response.json();
  if (!json.access_token) {
    throw new Error("Google token refresh did not return access_token.");
  }

  return json.access_token;
}

export async function fetchGoogleAdsData({
  accessToken,
  clientId = process.env.GOOGLE_ADS_CLIENT_ID,
  clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET,
  customerId = process.env.GOOGLE_ADS_CUSTOMER_ID,
  developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  fetchImpl = fetch,
  loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN,
} = {}) {
  if (!developerToken || !customerId) {
    return {
      errors: [
        {
          message:
            "GOOGLE_ADS_DEVELOPER_TOKEN or GOOGLE_ADS_CUSTOMER_ID is not configured.",
        },
      ],
      rows: [],
      status: "blocked",
    };
  }

  if (!refreshToken && !accessToken) {
    return {
      errors: [
        {
          message:
            "GOOGLE_ADS_REFRESH_TOKEN is not configured. Complete OAuth to generate one.",
        },
      ],
      rows: [],
      status: "blocked",
    };
  }

  let activeAccessToken = accessToken;

  if (!activeAccessToken) {
    try {
      activeAccessToken = await getGoogleAccessToken({
        clientId,
        clientSecret,
        fetchImpl,
        refreshToken,
      });
    } catch (error) {
      return {
        errors: [
          {
            message:
              error instanceof Error ? error.message : String(error),
          },
        ],
        rows: [],
        status: "error",
      };
    }
  }

  const cleanCustomerId = customerId.replace(/-/gu, "");
  const url = `${GOOGLE_ADS_API_BASE}/customers/${cleanCustomerId}/googleAds:search`;

  const headers = {
    authorization: `Bearer ${activeAccessToken}`,
    "content-type": "application/json",
    "developer-token": developerToken,
  };

  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId.replace(/-/gu, "");
  }

  const allRows = [];
  let pageToken = null;
  let pageCount = 0;
  const MAX_PAGES = 50;

  try {
    do {
      const body = { query: buildGoogleAdsQuery() };
      if (pageToken) body.pageToken = pageToken;

      const response = await fetchImpl(url, {
        body: JSON.stringify(body),
        headers,
        method: "POST",
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        return {
          errors: [
            {
              message: `Google Ads API returned HTTP ${response.status}.`,
              body: errorBody.slice(0, 500),
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
              message: json.error.message ?? "Unknown Google Ads API error.",
              status: json.error.status,
            },
          ],
          rows: allRows,
          status: "error",
        };
      }

      allRows.push(...(json.results ?? []));
      pageToken = json.nextPageToken ?? null;
      pageCount += 1;
    } while (pageToken && pageCount < MAX_PAGES);

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
 * Saves the raw Google Ads API rows to S3 before normalization.
 * Key pattern: google/YYYY-MM-DD/raw.json
 *
 * @param {object} opts
 * @param {object} opts.s3Client   - AWS SDK S3Client instance
 * @param {string} opts.bucket     - S3 bucket name
 * @param {string} opts.capturedAt - ISO timestamp used to derive the date key
 * @param {Array}  opts.rows       - Raw API rows from fetchGoogleAdsData
 */
async function saveRawToS3({ s3Client, bucket, capturedAt, rows }) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const date = capturedAt.slice(0, 10);
  const key = `google/${date}/raw.json`;
  const body = JSON.stringify({ capturedAt, rowCount: rows.length, rows }, null, 2);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/json",
    }),
  );
  console.log(`[google-performance] Raw response saved to s3://${bucket}/${key} (${rows.length} rows)`);
}

export async function runGooglePerformance({
  accessToken,
  capturedAt = new Date().toISOString(),
  clientId = process.env.GOOGLE_ADS_CLIENT_ID,
  clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET,
  customerId = process.env.GOOGLE_ADS_CUSTOMER_ID,
  developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  fetchImpl = fetch,
  loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN,
  // Optional: pass an S3Client and bucket name to save raw API response before normalizing.
  s3Client = null,
  rawBucket = null,
} = {}) {
  const result = await fetchGoogleAdsData({
    accessToken,
    clientId,
    clientSecret,
    customerId,
    developerToken,
    fetchImpl,
    loginCustomerId,
    refreshToken,
  });

  // Save raw rows to S3 when running in AWS context.
  if (s3Client && rawBucket && result.rows.length > 0) {
    await saveRawToS3({ s3Client, bucket: rawBucket, capturedAt, rows: result.rows });
  }

  const records = result.rows.map((row) =>
    normalizeGoogleRecord({ capturedAt, row }),
  );

  return buildGoogleArtifact({
    capturedAt,
    customerId: customerId ?? "unknown",
    errors: result.errors,
    records,
    status: result.status,
  });
}
