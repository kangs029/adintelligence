import { describe, expect, it, vi } from "vitest";

import {
  buildAcsCbsaUrl,
  fetchAcsTable,
  fetchTigerwebCbsaGeometries,
  fetchTigerwebCbsaPoints,
} from "./client.mjs";

describe("Census client", () => {
  it("builds the documented ACS CBSA query with the keyed 2024 dataset", () => {
    const url = buildAcsCbsaUrl({ apiKey: "test-key" });

    expect(url.origin).toBe("https://api.census.gov");
    expect(url.pathname).toBe("/data/2024/acs/acs5");
    expect(url.searchParams.get("get")).toBe(
      "NAME,B02015_021E,B02015_021M,B01003_001E,B01003_001M,B19013_001E,B19013_001M",
    );
    expect(url.searchParams.get("for")).toBe(
      "metropolitan statistical area/micropolitan statistical area:*",
    );
    expect(url.searchParams.get("key")).toBe("test-key");
  });

  it("requires an API key before calling the ACS data endpoint", async () => {
    const fetchImpl = vi.fn();

    await expect(fetchAcsTable({ apiKey: "", fetchImpl })).rejects.toThrow(
      /CENSUS_API_KEY/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects the current Census missing-key HTML response even when status is 200", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "",
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => "<html><title>Missing Key</title></html>",
    }));

    await expect(fetchAcsTable({ apiKey: "bad-key", fetchImpl })).rejects.toThrow(
      /non-JSON Census response/i,
    );
  });

  it("fetches both ACS 2024 TIGERweb CBSA point layers", async () => {
    const requested = [];
    const fetchImpl = vi.fn(async (url) => {
      const requestUrl = String(url);
      requested.push(requestUrl);
      const isMetroLayer = requestUrl.includes("/MapServer/15/query");
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          features: [
            {
              attributes: {
                GEOID: isMetroLayer ? "41940" : "26900",
                NAME:
                  isMetroLayer
                    ? "San Jose-Sunnyvale-Santa Clara, CA Metro Area"
                    : "Indianola, MS Micro Area",
                INTPTLAT: "+37.2207774",
                INTPTLON: "-121.6906224",
              },
            },
          ],
        }),
      };
    });

    await expect(fetchTigerwebCbsaPoints({ fetchImpl })).resolves.toEqual([
      {
        cbsa: "41940",
        name: "San Jose-Sunnyvale-Santa Clara, CA Metro Area",
        lat: 37.2207774,
        lng: -121.6906224,
      },
      {
        cbsa: "26900",
        name: "Indianola, MS Micro Area",
        lat: 37.2207774,
        lng: -121.6906224,
      },
    ]);
    expect(requested[0]).toContain("/MapServer/15/query");
    expect(requested[1]).toContain("/MapServer/16/query");
  });

  it("fetches TIGERweb CBSA geometry bounds for anchor sweeps", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        features: [
          {
            attributes: {
              GEOID: "41940",
              NAME: "San Jose-Sunnyvale-Santa Clara, CA Metro Area",
              INTPTLAT: "+36.9084718",
              INTPTLON: "-121.3713721",
            },
            geometry: {
              rings: [
                [
                  [-122.2, 37.5],
                  [-121.1, 37.4],
                  [-121.2, 36.7],
                  [-122.2, 37.5],
                ],
              ],
            },
          },
        ],
      }),
    }));

    await expect(fetchTigerwebCbsaGeometries({ fetchImpl })).resolves.toEqual([
      {
        cbsa: "41940",
        name: "San Jose-Sunnyvale-Santa Clara, CA Metro Area",
        lat: 36.9084718,
        lng: -121.3713721,
        bbox: {
          south: 36.7,
          west: -122.2,
          north: 37.5,
          east: -121.1,
        },
      },
      {
        cbsa: "41940",
        name: "San Jose-Sunnyvale-Santa Clara, CA Metro Area",
        lat: 36.9084718,
        lng: -121.3713721,
        bbox: {
          south: 36.7,
          west: -122.2,
          north: 37.5,
          east: -121.1,
        },
      },
    ]);
  });
});
