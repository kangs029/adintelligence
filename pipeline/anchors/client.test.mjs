import { describe, expect, it, vi } from "vitest";

import {
  buildOverpassQueries,
  buildOverpassQuery,
  buildOverpassUrl,
  fetchOverpassElements,
} from "./client.mjs";

describe("Overpass anchor client", () => {
  it("builds a bounded JSON query for anchor categories", () => {
    const query = buildOverpassQuery({
      bbox: { south: 37.3, west: -122.1, north: 37.5, east: -121.8 },
    });

    expect(query).toContain("[out:json]");
    expect(query).toContain('["amenity"="place_of_worship"]["religion"~"^(hindu|jain|sikh)$"]');
    expect(query).toContain('["shop"~"^(supermarket|convenience|grocery)$"]["name"~');
    expect(query).toContain('["sport"="cricket"]');
    expect(query).not.toContain('["amenity"="cinema"]');
    expect(query).toContain("out center tags;");
  });

  it("uses the GET data transport that worked in the live probe", () => {
    const url = buildOverpassUrl("[out:json];node(0,0,1,1);out;");

    expect(url.origin).toBe("https://overpass-api.de");
    expect(url.pathname).toBe("/api/interpreter");
    expect(url.searchParams.get("data")).toBe("[out:json];node(0,0,1,1);out;");
  });

  it("splits South Asian grocery sweeps across node and way batches", () => {
    const queries = buildOverpassQueries({
      bbox: { south: 37.3, west: -122.1, north: 37.5, east: -121.8 },
    });
    const groceryQueries = queries.filter((query) => query.includes('["shop"~'));

    expect(groceryQueries.some((query) => query.includes('node["shop"'))).toBe(true);
    expect(groceryQueries.some((query) => query.includes('way["shop"'))).toBe(true);
    expect(groceryQueries.some((query) => query.includes('relation["shop"'))).toBe(true);
  });

  it("rejects HTML responses from Overpass", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 406,
      statusText: "Not Acceptable",
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => "<html>Not Acceptable</html>",
    }));

    await expect(fetchOverpassElements({ query: "bad", fetchImpl })).rejects.toThrow(
      /non-JSON Overpass response|Overpass API failed/,
    );
  });

  it("returns elements and the OSM base timestamp", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        osm3s: { timestamp_osm_base: "2026-07-02T23:39:11Z" },
        elements: [{ type: "node", id: 1, lat: 37.4, lon: -122, tags: {} }],
      }),
    }));

    await expect(fetchOverpassElements({ query: "ok", fetchImpl })).resolves.toEqual({
      capturedAt: "2026-07-02T23:39:11Z",
      elements: [{ type: "node", id: 1, lat: 37.4, lon: -122, tags: {} }],
    });
  });

  it("backs off and retries temporary Overpass 429 responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: new Headers({ "retry-after": "0" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          osm3s: { timestamp_osm_base: "2026-07-03T05:15:36Z" },
          elements: [],
        }),
      });

    await expect(
      fetchOverpassElements({
        query: "ok",
        fetchImpl,
        maxRetries: 1,
        retryDelayMs: 0,
      }),
    ).resolves.toEqual({
      capturedAt: "2026-07-03T05:15:36Z",
      elements: [],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("backs off and retries temporary Overpass gateway failures", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 504,
        statusText: "Gateway Timeout",
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          osm3s: { timestamp_osm_base: "2026-07-03T06:44:29Z" },
          elements: [],
        }),
      });

    await expect(
      fetchOverpassElements({
        query: "ok",
        fetchImpl,
        maxRetries: 1,
        retryDelayMs: 0,
      }),
    ).resolves.toMatchObject({ elements: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
