/**
 * Lambda: xpat-ads-transform
 *
 * Reads raw Google Ads data from S3, joins hierarchically, and writes to DynamoDB.
 *
 * Join hierarchy:
 *   Campaign → Ad Group → Keyword → Search Terms
 *
 * DynamoDB Schema:
 *   PK: CAMPAIGN#{campaignId}
 *   SK: DATE#{date}#ADGROUP#{adGroupId}#KW#{keywordHash}
 *
 *   GSI-ByDate:
 *     GSI1PK: DATE#{date}
 *     GSI1SK: CAMPAIGN#{campaignId}#ADGROUP#{adGroupId}
 *
 *   GSI-ByKeyword:
 *     GSI2PK: KEYWORD#{keywordNormalized}
 *     GSI2SK: DATE#{date}#CAMPAIGN#{campaignId}
 *
 * Triggered by: S3 event on campaigns/{date}/data.json
 *
 * Environment variables:
 *   - RAW_BUCKET_NAME: S3 bucket name
 *   - DYNAMODB_TABLE: DynamoDB table name
 *   - ENVIRONMENT: dev or prod
 */

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { createHash } from "crypto";

const s3 = new S3Client({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// ---------------------------------------------------------------------------
// S3 Helpers
// ---------------------------------------------------------------------------

async function readJsonFromS3(bucket, key) {
  try {
    console.log(`[s3] Reading s3://${bucket}/${key}`);
    const response = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    const body = await response.Body.transformToString();
    const data = JSON.parse(body);
    console.log(`[s3] Loaded ${data.rows?.length ?? 0} rows from ${key}`);
    return data;
  } catch (err) {
    if (err.name === "NoSuchKey") {
      console.log(`[s3] File not found: ${key}`);
      return null;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Hash helpers
// ---------------------------------------------------------------------------

function hashKeyword(keyword) {
  if (!keyword) return "unknown";
  return createHash("md5").update(keyword.toLowerCase().trim()).digest("hex").slice(0, 8);
}

function normalizeKeyword(keyword) {
  if (!keyword) return "unknown";
  return keyword.toLowerCase().trim().replace(/\s+/g, "_").slice(0, 100);
}

// ---------------------------------------------------------------------------
// Join Logic
// ---------------------------------------------------------------------------

function buildJoinedRecords(date, campaigns, keywords, searchTerms, ads, geo, devices) {
  const records = [];

  // Index campaigns by campaignId + adGroupId + date
  const campaignIndex = new Map();
  for (const row of campaigns?.rows ?? []) {
    if (row.date !== date) continue; // Only process rows for the target date
    const key = `${row.campaignId}|${row.adGroupId}|${row.date}`;
    campaignIndex.set(key, row);
  }

  // Index search terms by campaignId + adGroupId
  const searchTermIndex = new Map();
  for (const row of searchTerms?.rows ?? []) {
    if (row.date !== date) continue;
    const key = `${row.campaignId}|${row.adGroupId}`;
    if (!searchTermIndex.has(key)) {
      searchTermIndex.set(key, []);
    }
    searchTermIndex.get(key).push({
      term: row.searchTerm,
      status: row.searchTermStatus,
      impressions: row.impressions,
      clicks: row.clicks,
      spendUsd: row.spendUsd,
      conversions: row.conversions,
      ctrPct: row.ctrPct,
    });
  }

  // Index ads by campaignId + adGroupId
  const adIndex = new Map();
  for (const row of ads?.rows ?? []) {
    const key = `${row.campaignId}|${row.adGroupId}`;
    if (!adIndex.has(key)) {
      adIndex.set(key, []);
    }
    adIndex.get(key).push({
      adId: row.adId,
      adType: row.adType,
      adStrength: row.adStrength,
      headline1: row.headline1,
      headline2: row.headline2,
      headline3: row.headline3,
      description1: row.description1,
      finalUrls: row.finalUrls,
    });
  }

  // Index geo by campaignId (rollup)
  const geoIndex = new Map();
  for (const row of geo?.rows ?? []) {
    if (row.date !== date) continue;
    const key = row.campaignId;
    if (!geoIndex.has(key)) {
      geoIndex.set(key, []);
    }
    geoIndex.get(key).push({
      countryCriterionId: row.countryCriterionId,
      impressions: row.impressions,
      clicks: row.clicks,
      spendUsd: row.spendUsd,
      conversions: row.conversions,
    });
  }

  // Index devices by campaignId + adGroupId
  const deviceIndex = new Map();
  for (const row of devices?.rows ?? []) {
    if (row.date !== date) continue;
    const key = `${row.campaignId}|${row.adGroupId}`;
    if (!deviceIndex.has(key)) {
      deviceIndex.set(key, {});
    }
    const d = deviceIndex.get(key);
    d[row.device] = {
      impressions: row.impressions,
      clicks: row.clicks,
      spendUsd: row.spendUsd,
      conversions: row.conversions,
    };
  }

  // Process keywords as the primary grain
  const processedKeys = new Set();

  for (const kw of keywords?.rows ?? []) {
    if (kw.date !== date) continue;

    const campaignKey = `${kw.campaignId}|${kw.adGroupId}|${kw.date}`;
    const campaign = campaignIndex.get(campaignKey);

    const keywordHash = hashKeyword(kw.keyword);
    const recordKey = `${kw.campaignId}|${kw.adGroupId}|${kw.keyword}|${kw.date}`;
    
    if (processedKeys.has(recordKey)) continue;
    processedKeys.add(recordKey);

    // Build the joined record
    const record = {
      // Primary Key
      PK: `CAMPAIGN#${kw.campaignId}`,
      SK: `DATE#${date}#ADGROUP#${kw.adGroupId}#KW#${keywordHash}`,

      // GSI-ByDate
      GSI1PK: `DATE#${date}`,
      GSI1SK: `CAMPAIGN#${kw.campaignId}#ADGROUP#${kw.adGroupId}`,

      // GSI-ByKeyword
      GSI2PK: `KEYWORD#${normalizeKeyword(kw.keyword)}`,
      GSI2SK: `DATE#${date}#CAMPAIGN#${kw.campaignId}`,

      // Campaign attributes
      campaignId: kw.campaignId,
      campaignName: kw.campaignName,
      campaignStatus: campaign?.campaignStatus ?? kw.campaignStatus,
      channelType: campaign?.channelType ?? null,
      channelSubType: campaign?.channelSubType ?? null,
      biddingStrategy: campaign?.biddingStrategy ?? null,

      // Ad Group attributes
      adGroupId: kw.adGroupId,
      adGroupName: kw.adGroupName,
      adGroupStatus: campaign?.adGroupStatus ?? null,
      adGroupType: campaign?.adGroupType ?? null,

      // Keyword attributes
      keyword: kw.keyword,
      matchType: kw.matchType,
      keywordStatus: kw.keywordStatus,
      qualityScore: kw.qualityScore,

      // Date
      date: date,

      // Metrics (from keyword level - most granular)
      impressions: kw.impressions,
      clicks: kw.clicks,
      spendUsd: kw.spendUsd,
      ctrPct: kw.ctrPct,
      avgCpcUsd: kw.avgCpcUsd,
      conversions: kw.conversions,
      costPerConversionUsd: kw.costPerConversionUsd,

      // Campaign-level metrics (aggregated)
      campaignImpressions: campaign?.impressions ?? null,
      campaignClicks: campaign?.clicks ?? null,
      campaignSpendUsd: campaign?.spendUsd ?? null,
      campaignConversions: campaign?.conversions ?? null,

      // Search terms for this ad group (nested array, top 10 by spend)
      searchTerms: (searchTermIndex.get(`${kw.campaignId}|${kw.adGroupId}`) ?? [])
        .sort((a, b) => (b.spendUsd ?? 0) - (a.spendUsd ?? 0))
        .slice(0, 10),

      // Ads for this ad group
      ads: adIndex.get(`${kw.campaignId}|${kw.adGroupId}`) ?? [],

      // Device breakdown for this ad group
      deviceBreakdown: deviceIndex.get(`${kw.campaignId}|${kw.adGroupId}`) ?? null,

      // Geo breakdown for this campaign (summary)
      geoSummary: (geoIndex.get(kw.campaignId) ?? [])
        .sort((a, b) => (b.spendUsd ?? 0) - (a.spendUsd ?? 0))
        .slice(0, 5),

      // Derived metrics
      isWastedSpend: kw.conversions === 0 && (kw.spendUsd ?? 0) > 5,
      isHighCpc: (kw.avgCpcUsd ?? 0) > 10,
      isLowQuality: kw.qualityScore !== null && kw.qualityScore < 5,

      // Metadata
      updatedAt: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60), // 90 days TTL
    };

    records.push(record);
  }

  // Also create campaign-level summary records (without keyword breakdown)
  const campaignSummaries = new Map();
  for (const row of campaigns?.rows ?? []) {
    if (row.date !== date) continue;
    
    const key = `${row.campaignId}|${row.date}`;
    if (!campaignSummaries.has(key)) {
      campaignSummaries.set(key, {
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        campaignStatus: row.campaignStatus,
        channelType: row.channelType,
        date: row.date,
        impressions: 0,
        clicks: 0,
        spendUsd: 0,
        conversions: 0,
        adGroups: new Set(),
      });
    }
    const summary = campaignSummaries.get(key);
    summary.impressions += row.impressions ?? 0;
    summary.clicks += row.clicks ?? 0;
    summary.spendUsd += row.spendUsd ?? 0;
    summary.conversions += row.conversions ?? 0;
    summary.adGroups.add(row.adGroupId);
  }

  // Add campaign summary records
  for (const [, summary] of campaignSummaries) {
    records.push({
      PK: `CAMPAIGN#${summary.campaignId}`,
      SK: `DATE#${summary.date}#SUMMARY`,

      GSI1PK: `DATE#${summary.date}`,
      GSI1SK: `CAMPAIGN#${summary.campaignId}#SUMMARY`,

      // No GSI2 for summary records

      campaignId: summary.campaignId,
      campaignName: summary.campaignName,
      campaignStatus: summary.campaignStatus,
      channelType: summary.channelType,
      date: summary.date,
      
      impressions: summary.impressions,
      clicks: summary.clicks,
      spendUsd: Math.round(summary.spendUsd * 100) / 100,
      conversions: summary.conversions,
      ctrPct: summary.impressions > 0 ? Math.round(summary.clicks / summary.impressions * 10000) / 100 : null,
      avgCpcUsd: summary.clicks > 0 ? Math.round(summary.spendUsd / summary.clicks * 100) / 100 : null,
      costPerConversionUsd: summary.conversions > 0 ? Math.round(summary.spendUsd / summary.conversions * 100) / 100 : null,
      
      adGroupCount: summary.adGroups.size,
      recordType: "CAMPAIGN_SUMMARY",

      geoSummary: (geoIndex.get(summary.campaignId) ?? [])
        .sort((a, b) => (b.spendUsd ?? 0) - (a.spendUsd ?? 0))
        .slice(0, 5),

      updatedAt: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60),
    });
  }

  return records;
}

// ---------------------------------------------------------------------------
// DynamoDB Batch Writer
// ---------------------------------------------------------------------------

async function batchWriteToDynamoDB(tableName, records) {
  const BATCH_SIZE = 25; // DynamoDB limit
  let written = 0;
  let failed = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    
    const params = {
      RequestItems: {
        [tableName]: batch.map(record => ({
          PutRequest: { Item: record }
        }))
      }
    };

    try {
      const result = await docClient.send(new BatchWriteCommand(params));
      
      // Handle unprocessed items
      const unprocessed = result.UnprocessedItems?.[tableName]?.length ?? 0;
      written += batch.length - unprocessed;
      failed += unprocessed;

      if (unprocessed > 0) {
        console.log(`[dynamodb] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length - unprocessed} written, ${unprocessed} unprocessed`);
      }
    } catch (err) {
      console.error(`[dynamodb] Batch write error:`, err.message);
      failed += batch.length;
    }

    // Progress log every 100 batches
    if ((i / BATCH_SIZE) % 100 === 0 && i > 0) {
      console.log(`[dynamodb] Progress: ${written} written, ${failed} failed`);
    }
  }

  return { written, failed };
}

// ---------------------------------------------------------------------------
// Main Lambda Handler
// ---------------------------------------------------------------------------

export async function handler(event, context) {
  console.log("[transform] Starting data transformation");
  console.log("[transform] Event:", JSON.stringify(event, null, 2));

  const bucketName = process.env.RAW_BUCKET_NAME;
  const tableName = process.env.DYNAMODB_TABLE;

  if (!bucketName || !tableName) {
    throw new Error("RAW_BUCKET_NAME and DYNAMODB_TABLE environment variables required");
  }

  // Extract folder date from S3 event
  // Event structure: s3://bucket/campaigns/{date}/data.json
  let folderDate;
  
  if (event.Records) {
    // S3 trigger event
    const s3Key = event.Records[0].s3.object.key;
    const match = s3Key.match(/campaigns\/(\d{4}-\d{2}-\d{2})\/data\.json/);
    if (match) {
      folderDate = match[1];
    }
  } else if (event.date) {
    // Manual invocation with date parameter
    folderDate = event.date;
  }

  if (!folderDate) {
    // Default to today
    folderDate = new Date().toISOString().slice(0, 10);
    console.log(`[transform] No date in event, using today: ${folderDate}`);
  }

  console.log(`[transform] Loading data from folder: ${folderDate}`);

  // Load all raw data sources for this folder
  const [campaigns, keywords, searchTerms, ads, geo, devices] = await Promise.all([
    readJsonFromS3(bucketName, `campaigns/${folderDate}/data.json`),
    readJsonFromS3(bucketName, `keywords/${folderDate}/data.json`),
    readJsonFromS3(bucketName, `search-terms/${folderDate}/data.json`),
    readJsonFromS3(bucketName, `ads/${folderDate}/data.json`),
    readJsonFromS3(bucketName, `geo/${folderDate}/data.json`),
    readJsonFromS3(bucketName, `devices/${folderDate}/data.json`),
  ]);

  if (!campaigns || !keywords) {
    console.log("[transform] Missing required data (campaigns or keywords), skipping");
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "No data to process", folderDate }),
    };
  }

  // Find all unique dates in the data
  const allDates = new Set();
  for (const row of campaigns?.rows ?? []) {
    if (row.date) allDates.add(row.date);
  }
  const datesToProcess = [...allDates].sort();
  console.log(`[transform] Dates found in data: ${datesToProcess.join(", ")}`);

  if (datesToProcess.length === 0) {
    console.log("[transform] No valid dates in data, skipping");
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "No dates in data", folderDate }),
    };
  }

  // Process each date
  let totalRecords = 0;
  let totalWritten = 0;
  let totalFailed = 0;

  for (const date of datesToProcess) {
    console.log(`\n[transform] Processing date: ${date}`);
    
    // Build joined records for this date
    const records = buildJoinedRecords(date, campaigns, keywords, searchTerms, ads, geo, devices);
    console.log(`[transform] Built ${records.length} records for ${date}`);
    totalRecords += records.length;

    if (records.length > 0) {
      // Write to DynamoDB
      const { written, failed } = await batchWriteToDynamoDB(tableName, records);
      totalWritten += written;
      totalFailed += failed;
    }
  }
  // Summary
  console.log("\n=== TRANSFORMATION COMPLETE ===");
  console.log(`Folder: ${folderDate}`);
  console.log(`Dates processed: ${datesToProcess.join(", ")}`);
  console.log(`Total records built: ${totalRecords}`);
  console.log(`Written to DynamoDB: ${totalWritten}`);
  console.log(`Failed: ${totalFailed}`);

  return {
    statusCode: totalFailed > 0 ? 207 : 200,
    body: JSON.stringify({
      message: "Transformation complete",
      folderDate,
      datesProcessed: datesToProcess,
      recordsBuilt: totalRecords,
      written: totalWritten,
      failed: totalFailed,
    }),
  };
}
