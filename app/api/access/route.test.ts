import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ACCESS_COOKIE_MAX_AGE,
  ACCESS_COOKIE_NAME,
  deriveAccessToken,
} from "@/lib/access/access-gate";
import { POST } from "./route";

const configuredPassword = "team passphrase";

function formRequest(
  password: string,
  next = "/signals?market=dal",
  url = "https://xpat.test/api/access",
) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password, next }),
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("password submission route", () => {
  it("sets a secure seven-day cookie and redirects to the safe destination", async () => {
    const issuedAt = new Date("2026-07-14T17:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(issuedAt);
    vi.stubEnv("XPAT_ACCESS_PASSWORD", configuredPassword);

    const response = await POST(formRequest(configuredPassword));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://xpat.test/signals?market=dal",
    );
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(
      `${ACCESS_COOKIE_NAME}=${deriveAccessToken(
        configuredPassword,
        issuedAt.getTime(),
      )}`,
    );
    expect(cookie).toMatch(/HttpOnly/iu);
    expect(cookie).toMatch(/Secure/iu);
    expect(cookie).toMatch(/SameSite=Lax/iu);
    expect(cookie).toMatch(/Path=\//u);
    expect(cookie).toContain(`Max-Age=${ACCESS_COOKIE_MAX_AGE}`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow, noarchive",
    );
  });

  it("rejects a wrong password without setting a cookie or exposing the secret", async () => {
    vi.stubEnv("XPAT_ACCESS_PASSWORD", configuredPassword);

    const response = await POST(formRequest("wrong password", "/playbook"));

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    const html = await response.text();
    expect(html).toContain("Incorrect password");
    expect(html).toContain('value="/playbook"');
    expect(html).not.toContain(configuredPassword);
  });

  it("fails closed when the password is not configured", async () => {
    vi.stubEnv("XPAT_ACCESS_PASSWORD", "");

    const response = await POST(formRequest(configuredPassword));

    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).toContain("Access is temporarily unavailable");
  });

  it.each([
    "https://evil.example/path",
    "//evil.example/path",
    "/\\evil.example/path",
  ])("redirects unsafe destination %s to the root", async (next) => {
    vi.stubEnv("XPAT_ACCESS_PASSWORD", configuredPassword);

    const response = await POST(formRequest(configuredPassword, next));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://xpat.test/");
  });

  it("fails closed when form data cannot be parsed", async () => {
    vi.stubEnv("XPAT_ACCESS_PASSWORD", configuredPassword);
    const request = new NextRequest("https://xpat.test/api/access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).toContain("Incorrect password");
  });
});
