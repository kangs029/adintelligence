/**
 * DynamoDB client singleton for ad performance tools.
 * 
 * Reads from xpat-ads-intelligence-{env} table in ap-southeast-2.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

// Singleton client
let docClient: DynamoDBDocumentClient | null = null;

export function getDynamoClient(): DynamoDBDocumentClient {
  if (docClient) return docClient;

  const region = process.env.ADS_DYNAMODB_REGION ?? "ap-southeast-2";

  // Credentials (same pattern as lib/ai/config.ts):
  //   1. BEDROCK_ACCESS_KEY_ID + BEDROCK_SECRET_ACCESS_KEY (Amplify prod)
  //   2. AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (local dev)
  //   3. IAM role via default credential chain (fallback)
  const credentials = getCredentials();

  const client = new DynamoDBClient({
    region,
    ...(credentials ? { credentials } : {}),
  });

  docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });

  return docClient;
}

function getCredentials() {
  if (process.env.BEDROCK_ACCESS_KEY_ID && process.env.BEDROCK_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.BEDROCK_ACCESS_KEY_ID,
      secretAccessKey: process.env.BEDROCK_SECRET_ACCESS_KEY,
    };
  }
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }
  // No explicit keys — SDK default provider chain (IAM role) will be used
  return null;
}

export function getTableName(): string {
  return process.env.ADS_DYNAMODB_TABLE ?? "xpat-ads-intelligence-dev";
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export interface QueryOptions {
  limit?: number;
  scanIndexForward?: boolean; // false = descending order
}

/**
 * Query by primary key (PK + SK prefix)
 */
export async function queryByPK(
  pk: string,
  skPrefix?: string,
  options: QueryOptions = {}
): Promise<Record<string, unknown>[]> {
  const client = getDynamoClient();
  const tableName = getTableName();

  let keyCondition = "PK = :pk";
  const expressionValues: Record<string, unknown> = { ":pk": pk };

  if (skPrefix) {
    keyCondition += " AND begins_with(SK, :sk)";
    expressionValues[":sk"] = skPrefix;
  }

  const response = await client.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: expressionValues,
      Limit: options.limit,
      ScanIndexForward: options.scanIndexForward ?? true,
    })
  );

  return (response.Items ?? []) as Record<string, unknown>[];
}

/**
 * Query GSI-ByDate (GSI1PK, GSI1SK)
 */
export async function queryByDate(
  date: string,
  skPrefix?: string,
  options: QueryOptions = {}
): Promise<Record<string, unknown>[]> {
  const client = getDynamoClient();
  const tableName = getTableName();

  let keyCondition = "GSI1PK = :pk";
  const expressionValues: Record<string, unknown> = { ":pk": `DATE#${date}` };

  if (skPrefix) {
    keyCondition += " AND begins_with(GSI1SK, :sk)";
    expressionValues[":sk"] = skPrefix;
  }

  const response = await client.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "GSI-ByDate",
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: expressionValues,
      Limit: options.limit,
      ScanIndexForward: options.scanIndexForward ?? true,
    })
  );

  return (response.Items ?? []) as Record<string, unknown>[];
}

/**
 * Query GSI-ByKeyword (GSI2PK, GSI2SK)
 */
export async function queryByKeyword(
  keyword: string,
  options: QueryOptions = {}
): Promise<Record<string, unknown>[]> {
  const client = getDynamoClient();
  const tableName = getTableName();

  // Normalize keyword to match how it was stored
  const normalizedKeyword = keyword.toLowerCase().trim().replace(/\s+/g, "_").slice(0, 100);

  const response = await client.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "GSI-ByKeyword",
      KeyConditionExpression: "GSI2PK = :pk",
      ExpressionAttributeValues: { ":pk": `KEYWORD#${normalizedKeyword}` },
      Limit: options.limit,
      ScanIndexForward: options.scanIndexForward ?? false, // Most recent first
    })
  );

  return (response.Items ?? []) as Record<string, unknown>[];
}

/**
 * Query campaign by ID across all dates
 */
export async function queryCampaign(
  campaignId: string,
  options: QueryOptions = {}
): Promise<Record<string, unknown>[]> {
  return queryByPK(`CAMPAIGN#${campaignId}`, undefined, options);
}

/**
 * Query campaign summaries only (excludes keyword-level records)
 */
export async function queryCampaignSummaries(
  campaignId: string,
  options: QueryOptions = {}
): Promise<Record<string, unknown>[]> {
  const client = getDynamoClient();
  const tableName = getTableName();

  const response = await client.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :pk AND contains(SK, :summary)",
      ExpressionAttributeValues: {
        ":pk": `CAMPAIGN#${campaignId}`,
        ":summary": "#SUMMARY",
      },
      Limit: options.limit,
      ScanIndexForward: options.scanIndexForward ?? false,
    })
  );

  return (response.Items ?? []) as Record<string, unknown>[];
}

/**
 * Get all campaign summaries for a date
 */
export async function getCampaignSummariesForDate(
  date: string,
  options: QueryOptions = {}
): Promise<Record<string, unknown>[]> {
  const items = await queryByDate(date, "CAMPAIGN#", options);
  // Filter to only summary records
  return items.filter(item => String(item.SK ?? "").includes("#SUMMARY"));
}

/**
 * Scan for all unique campaigns (use sparingly)
 */
export async function scanAllCampaigns(
  limit = 100
): Promise<Record<string, unknown>[]> {
  const client = getDynamoClient();
  const tableName = getTableName();

  const response = await client.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: "contains(SK, :summary)",
      ExpressionAttributeValues: { ":summary": "#SUMMARY" },
      Limit: limit,
    })
  );

  return (response.Items ?? []) as Record<string, unknown>[];
}
