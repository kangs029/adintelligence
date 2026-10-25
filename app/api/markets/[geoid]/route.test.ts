import { describe, expect, it } from "vitest";

import { GET } from "./route";

function request(geoid: string) {
  return GET(new Request(`https://xpat-os.test/api/markets/${geoid}`), {
    params: Promise.resolve({ geoid }),
  });
}

describe("market evidence API route", () => {
  it("returns only the selected market anchors with drawer evidence", async () => {
    const response = await request("31000US41940");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.detail.market.geoid).toBe("31000US41940");
    expect(body.anchors.features.length).toBeGreaterThan(0);
    expect(
      body.anchors.features.every(
        (feature: { properties: { marketGeoid: string } }) =>
          feature.properties.marketGeoid === "31000US41940",
      ),
    ).toBe(true);
    expect(body.detail.anchorRows.length).toBe(body.anchors.features.length);
  });

  it("returns 404 for unknown markets", async () => {
    const response = await request("missing-market");

    expect(response.status).toBe(404);
  });
});
