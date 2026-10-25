/**
 * API endpoint to get the latest Google Ads data date from DynamoDB.
 * Returns the most recent date for which we have campaign data.
 */

import { NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const tableName = process.env.ADS_DYNAMODB_TABLE;
  const region = process.env.ADS_DYNAMODB_REGION ?? "ap-southeast-2";

  // If DynamoDB is not configured, fall back to null
  if (!tableName) {
    return NextResponse.json({ latestDate: null, source: "none" });
  }

  try {
    const credentials =
      process.env.BEDROCK_ACCESS_KEY_ID && process.env.BEDROCK_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.BEDROCK_ACCESS_KEY_ID,
            secretAccessKey: process.env.BEDROCK_SECRET_ACCESS_KEY,
          }
        : process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined;

    const client = new DynamoDBClient({
      region,
      ...(credentials ? { credentials } : {}),
    });
    const docClient = DynamoDBDocumentClient.from(client);

    // Scan for summary records and extract unique dates
    const response = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: "contains(SK, :summary)",
        ExpressionAttributeValues: { ":summary": "#SUMMARY" },
        ProjectionExpression: "#d",
        ExpressionAttributeNames: { "#d": "date" },
        Limit: 200,
      })
    );

    const dates = (response.Items ?? [])
      .map((item) => item.date as string)
      .filter(Boolean)
      .sort()
      .reverse();

    const latestDate = dates[0] ?? null;

    return NextResponse.json({
      latestDate,
      source: "dynamodb",
      recordCount: dates.length,
    });
  } catch (error) {
    console.error("Failed to fetch ads freshness:", error);
    return NextResponse.json(
      { latestDate: null, source: "error", error: String(error) },
      { status: 500 }
    );
  }
}
