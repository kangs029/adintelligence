import { afterEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";

import { GET } from "./route";

const originalCronSecret = process.env.CRON_SECRET;
const originalWebhookUrl = process.env.FX_SNAPSHOT_WEBHOOK_URL;

function restoreEnv(key: "CRON_SECRET" | "FX_SNAPSHOT_WEBHOOK_URL", value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function request(auth?: string) {
  return new Request("https://xpat-os.test/api/cron/fx-snapshot", {
    headers: auth ? { authorization: auth } : undefined,
  }) as NextRequest;
}

describe("FX snapshot cron route", () => {
  afterEach(() => {
    restoreEnv("CRON_SECRET", originalCronSecret);
    restoreEnv("FX_SNAPSHOT_WEBHOOK_URL", originalWebhookUrl);
  });

  it("requires CRON_SECRET before webhook persistence is enabled", async () => {
    delete process.env.CRON_SECRET;
    process.env.FX_SNAPSHOT_WEBHOOK_URL = "https://example.com/fx-sink";

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.reason).toContain("CRON_SECRET");
  });

  it("rejects requests with a mismatched cron secret", async () => {
    process.env.CRON_SECRET = "secret";
    delete process.env.FX_SNAPSHOT_WEBHOOK_URL;

    const response = await GET(request("Bearer wrong"));

    expect(response.status).toBe(401);
  });
});
