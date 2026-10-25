import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import marketsArtifact from "@/data/artifacts/markets.json";
import { parseAdsCsv } from "./ads-import";
import { coverageForMarket } from "./coverage";

const markets = marketsArtifact.data.markets;
const sanJose = markets.find((market) => market.geoid === "31000US41940")!;

describe("parseAdsCsv", () => {
  it("accepts synonym headers and applies the first-transfer proof floor", () => {
    const result = parseAdsCsv(
      [
        "geo_name,state,cost,first_transfers,link_clicks,imp,channel,campaign_name,baseline",
        "San Jose-Sunnyvale-Santa Clara,CA,1000,9,120,5000,google,geo row,",
      ].join("\n"),
      markets,
    );
    const performance = result.mappedMarkets[0];

    expect(performance.marketGeoid).toBe("31000US41940");
    expect(performance.firstTransfers).toBe(9);
    expect(performance.trusted).toBe(false);
    expect(coverageForMarket(sanJose, result).status).toBe("confirmed-gap");
  });

  it("parses the committed demo sample as a trusted sample state without entering proof aggregates", () => {
    const sample = readFileSync(
      join(process.cwd(), "public/samples/xpat-proof-gate-sample-data.csv"),
      "utf8",
    );
    const result = parseAdsCsv(sample, markets);
    const sanJoseCoverage = coverageForMarket(sanJose, result);
    const sanJoseSample = result.sampleMappedMarkets.find((row) => row.marketGeoid === sanJose.geoid);

    expect(result.schema.missingRecommendedHeaders).toEqual([]);
    expect(result.mappedMarkets).toHaveLength(0);
    expect(result.unmappedRows).toHaveLength(0);
    expect(result.sampleRows).toHaveLength(3);
    expect(result.sampleUnmappedRows).toHaveLength(1);
    expect(sanJoseSample).toMatchObject({
      firstTransfers: 12,
      rowCount: 1,
      trusted: true,
    });
    expect(sanJoseCoverage).toMatchObject({
      firstTransfers: 0,
      rowCount: 0,
      status: "insufficient-data",
    });
  });

  it("does not treat generic amount or activations columns as proof fields", () => {
    const result = parseAdsCsv(
      [
        "market_geoid,amount,activations,clicks,impressions,platform,campaign",
        "31000US41940,1200,12,200,9000,google,generic funnel export",
      ].join("\n"),
      markets,
    );
    const performance = result.mappedMarkets[0];

    expect(result.schema.missingRecommendedHeaders).toContain("spend or cost");
    expect(result.schema.missingRecommendedHeaders).toContain("first_transfers for proof status");
    expect(performance).toMatchObject({
      costUsd: null,
      firstTransfers: 0,
      hasFirstTransferEvidence: false,
      trusted: false,
    });
    expect(coverageForMarket(sanJose, result).status).toBe("insufficient-data");
  });

  it("isolates unmapped rows and does not infer geography from campaign names", () => {
    const result = parseAdsCsv(
      [
        "market_geoid,spend,conversions,clicks,impressions,platform,campaign,baseline_group",
        "31000US41940,1200,12,200,9000,google,san jose direct,",
        ",400,20,50,3000,google,Seattle campaign,",
        ",900,30,100,5000,google,national baseline,baseline",
      ].join("\n"),
      markets,
    );

    expect(result.mappedMarkets).toHaveLength(1);
    expect(result.mappedMarkets[0]).toMatchObject({
      conversions: 12,
      firstTransfers: 0,
      hasFirstTransferEvidence: false,
      trusted: false,
    });
    expect(result.unmappedRows).toHaveLength(1);
    expect(result.baselineRows).toHaveLength(1);
    expect(coverageForMarket(sanJose, result).status).toBe("insufficient-data");
  });

  it("does not fall back to conversions when first transfers are explicitly zero", () => {
    const result = parseAdsCsv(
      [
        "market_geoid,spend,conversions,first_transfers,clicks,impressions,platform,campaign",
        "31000US41940,1200,12,0,200,9000,google,san jose direct",
      ].join("\n"),
      markets,
    );
    const performance = result.mappedMarkets[0];

    expect(performance.conversions).toBe(12);
    expect(performance.firstTransfers).toBe(0);
    expect(performance.hasFirstTransferEvidence).toBe(true);
    expect(performance.trusted).toBe(false);
    expect(coverageForMarket(sanJose, result).status).toBe("confirmed-gap");
  });

  it("parses quoted spreadsheet numbers with thousands separators", () => {
    const result = parseAdsCsv(
      [
        "market_geoid,spend,conversions,first_transfers,clicks,impressions,platform,campaign",
        "31000US41940,\"1,200.50\",\"1,200\",10,\"2,300\",\"9,000\",google,san jose direct",
      ].join("\n"),
      markets,
    );
    const performance = result.mappedMarkets[0];

    expect(performance.costUsd).toBe(1200.5);
    expect(performance.conversions).toBe(1200);
    expect(performance.firstTransfers).toBe(10);
    expect(performance.clicks).toBe(2300);
    expect(performance.impressions).toBe(9000);
    expect(performance.hasFirstTransferEvidence).toBe(true);
    expect(performance.trusted).toBe(true);
  });

  it("normalizes five-digit CBSA codes from accepted market id headers", () => {
    const result = parseAdsCsv(
      [
        "cbsa,spend,first_transfers,clicks,impressions,platform,campaign",
        "41940,1200,10,200,9000,google,san jose direct",
      ].join("\n"),
      markets,
    );

    expect(result.unmappedRows).toHaveLength(0);
    expect(result.mappedMarkets[0]).toMatchObject({
      marketGeoid: "31000US41940",
      firstTransfers: 10,
      trusted: true,
    });
  });

  it("strips a UTF-8 BOM from the first CSV header", () => {
    const result = parseAdsCsv(
      [
        "\uFEFFmarket_geoid,spend,first_transfers,clicks,impressions,platform,campaign",
        "31000US41940,1200,10,200,9000,google,san jose direct",
      ].join("\n"),
      markets,
    );

    expect(result.unmappedRows).toHaveLength(0);
    expect(result.mappedMarkets[0]).toMatchObject({
      marketGeoid: "31000US41940",
      firstTransfers: 10,
      trusted: true,
    });
  });

  it("keeps blank or non-numeric first-transfer cells insufficient", () => {
    const result = parseAdsCsv(
      [
        "market_geoid,spend,first_transfers,clicks,impressions,platform,campaign",
        "31000US41940,1200,,200,9000,google,san jose direct",
        "31000US41940,300,not available,40,2000,google,san jose direct",
      ].join("\n"),
      markets,
    );
    const performance = result.mappedMarkets[0];

    expect(performance.firstTransfers).toBe(0);
    expect(performance.hasFirstTransferEvidence).toBe(false);
    expect(coverageForMarket(sanJose, result).status).toBe("insufficient-data");
  });

  it("keeps mixed complete and incomplete first-transfer rows insufficient", () => {
    const result = parseAdsCsv(
      [
        "market_geoid,spend,first_transfers,clicks,impressions,platform,campaign",
        "31000US41940,1200,0,200,9000,google,san jose direct",
        "31000US41940,300,,40,2000,google,san jose secondary",
      ].join("\n"),
      markets,
    );
    const performance = result.mappedMarkets[0];

    expect(performance.firstTransfers).toBe(0);
    expect(performance.hasFirstTransferEvidence).toBe(false);
    expect(coverageForMarket(sanJose, result).status).toBe("insufficient-data");
  });

  it("does not mark incomplete mixed rows already covered even when complete rows reach the floor", () => {
    const result = parseAdsCsv(
      [
        "market_geoid,spend,first_transfers,clicks,impressions,platform,campaign",
        "31000US41940,1200,10,200,9000,google,san jose direct",
        "31000US41940,300,,40,2000,google,san jose secondary",
      ].join("\n"),
      markets,
    );
    const performance = result.mappedMarkets[0];

    expect(performance.firstTransfers).toBe(10);
    expect(performance.hasFirstTransferEvidence).toBe(false);
    expect(performance.trusted).toBe(false);
    expect(coverageForMarket(sanJose, result).status).toBe("insufficient-data");
  });

  it("keeps omitted optional metrics as missing instead of zero", () => {
    const result = parseAdsCsv(
      [
        "market_geoid,first_transfers",
        "31000US41940,10",
      ].join("\n"),
      markets,
    );
    const performance = result.mappedMarkets[0];
    const coverage = coverageForMarket(sanJose, result);

    expect(performance).toMatchObject({
      clicks: null,
      costUsd: null,
      impressions: null,
      trusted: true,
    });
    expect(coverage).toMatchObject({
      costUsd: null,
      impressions: null,
      status: "already-covered",
    });
  });

  it("maps exact single-name markets", () => {
    const result = parseAdsCsv(
      [
        "geo_name,state,cost,first_transfers,clicks,impressions,platform,campaign",
        "Cleveland,OH,400,10,80,2000,google,cleveland direct",
      ].join("\n"),
      markets,
    );

    expect(result.unmappedRows).toHaveLength(0);
    expect(result.mappedMarkets[0]).toMatchObject({
      marketGeoid: "31000US17410",
      firstTransfers: 10,
      trusted: true,
    });
  });

  it("matches exact market names when CSV exports omit diacritics", () => {
    const result = parseAdsCsv(
      [
        "geo_name,state,cost,first_transfers,clicks,impressions,platform,campaign",
        "San Juan-Bayamon-Caguas,PR,400,10,80,2000,google,san juan direct",
      ].join("\n"),
      markets,
    );

    expect(result.unmappedRows).toHaveLength(0);
    expect(result.mappedMarkets[0]).toMatchObject({
      marketGeoid: "31000US41980",
      firstTransfers: 10,
      trusted: true,
    });
  });

  it("does not map short city names into metro proof", () => {
    const result = parseAdsCsv(
      [
        "geo_name,state,cost,first_transfers,clicks,impressions,platform,campaign",
        "San Jose,CA,400,12,80,2000,google,city direct",
      ].join("\n"),
      markets,
    );

    expect(result.mappedMarkets).toHaveLength(0);
    expect(result.unmappedRows).toHaveLength(1);
    expect(coverageForMarket(sanJose, result).status).toBe("insufficient-data");
  });

  it("does not treat city headers as market geography", () => {
    const result = parseAdsCsv(
      [
        "city,state,cost,first_transfers,clicks,impressions,platform,campaign",
        "San Jose,CA,400,12,80,2000,google,city direct",
      ].join("\n"),
      markets,
    );

    expect(result.schema.missingRecommendedHeaders).toContain("market_geoid or geo_name plus state");
    expect(result.mappedMarkets).toHaveLength(0);
    expect(result.unmappedRows).toHaveLength(1);
    expect(coverageForMarket(sanJose, result).status).toBe("insufficient-data");
  });

  it("keeps strong markets insufficient when an upload has no mapped rows", () => {
    const result = parseAdsCsv(
      [
        "geo_name,state,cost,conversions,clicks,impressions,platform,campaign",
        "Unknown Metro,CA,100,12,20,1000,google,unknown",
      ].join("\n"),
      markets,
    );

    expect(coverageForMarket(sanJose, result).status).toBe("insufficient-data");
  });
});
