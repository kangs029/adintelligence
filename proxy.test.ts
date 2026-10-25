import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ACCESS_COOKIE_NAME,
  deriveAccessToken,
} from "@/lib/access/access-gate";
import { proxy } from "./proxy";

const password = "team passphrase";

function request(path: string, cookie?: string) {
  return new NextRequest(`https://xpat.test${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("password gate proxy", () => {
  it.each([
    "/",
    "/competitors",
    "/api/fx",
    "/og/xpat-os.png",
    "/_next/static/chunks/app.js",
  ])("blocks unauthenticated request to %s", async (path) => {
    vi.stubEnv("XPAT_ACCESS_PASSWORD", password);

    const response = proxy(request(path));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow, noarchive",
    );
    const html = await response.text();
    expect(html).toContain("Private preview");
    expect(html).toContain(`value="${path}"`);
    expect(html).not.toContain("app-shell");
  });

  it("fails closed when the password is not configured", async () => {
    vi.stubEnv("XPAT_ACCESS_PASSWORD", "");

    const response = proxy(request("/signals"));

    expect(response.status).toBe(503);
    expect(await response.text()).toContain("Access is temporarily unavailable");
  });

  it("rejects a cookie derived from an old password", () => {
    vi.stubEnv("XPAT_ACCESS_PASSWORD", password);
    const staleCookie = `${ACCESS_COOKIE_NAME}=${deriveAccessToken("old passphrase")}`;

    const response = proxy(request("/playbook", staleCookie));

    expect(response.status).toBe(401);
  });

  it("passes through a request carrying the current token", () => {
    vi.stubEnv("XPAT_ACCESS_PASSWORD", password);
    const validCookie = `${ACCESS_COOKIE_NAME}=${deriveAccessToken(password)}`;

    const response = proxy(request("/sources", validCookie));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow, noarchive",
    );
  });

  it("allows the password submission endpoint to reach its route handler", () => {
    vi.stubEnv("XPAT_ACCESS_PASSWORD", password);

    const response = proxy(request("/api/access"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow, noarchive",
    );
  });
});
