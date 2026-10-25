import { describe, expect, it } from "vitest";

import {
  ACCESS_COOKIE_MAX_AGE,
  ACCESS_COOKIE_NAME,
  accessResponseHeaders,
  deriveAccessToken,
  isAccessCookieValid,
  readAccessPassword,
  renderAccessPage,
  sanitizeNextPath,
  secureEqual,
} from "@/lib/access/access-gate";

describe("access gate primitives", () => {
  it("derives a stable password-specific token for a fixed issue time", () => {
    const issuedAt = Date.UTC(2026, 6, 14, 17, 0, 0);

    expect(deriveAccessToken("team passphrase", issuedAt)).toBe(
      deriveAccessToken("team passphrase", issuedAt),
    );
    expect(deriveAccessToken("team passphrase", issuedAt)).not.toBe(
      deriveAccessToken("rotated passphrase", issuedAt),
    );
    expect(deriveAccessToken("team passphrase", issuedAt)).not.toBe(
      deriveAccessToken("team passphrase", issuedAt + 1_000),
    );
    expect(ACCESS_COOKIE_NAME).toBe("xpat_access");
    expect(ACCESS_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 7);
  });

  it("compares secrets and validates only an unexpired current token", () => {
    const password = "team passphrase";
    const issuedAt = Date.UTC(2026, 6, 14, 17, 0, 0);
    const token = deriveAccessToken(password, issuedAt);

    expect(secureEqual("same", "same")).toBe(true);
    expect(secureEqual("same", "different")).toBe(false);
    expect(
      isAccessCookieValid(
        token,
        password,
        issuedAt + ACCESS_COOKIE_MAX_AGE * 1_000 - 1,
      ),
    ).toBe(true);
    expect(
      isAccessCookieValid(
        token,
        password,
        issuedAt + ACCESS_COOKIE_MAX_AGE * 1_000,
      ),
    ).toBe(false);
    expect(isAccessCookieValid(token, "rotated passphrase", issuedAt)).toBe(
      false,
    );
    expect(isAccessCookieValid(`${token}tampered`, password, issuedAt)).toBe(
      false,
    );
    expect(isAccessCookieValid(undefined, password, issuedAt)).toBe(false);
  });

  it("preserves configured password whitespace but rejects blank configuration", () => {
    expect(readAccessPassword({ XPAT_ACCESS_PASSWORD: " pass phrase " })).toBe(
      " pass phrase ",
    );
    expect(readAccessPassword({ XPAT_ACCESS_PASSWORD: "   " })).toBeNull();
    expect(readAccessPassword({})).toBeNull();
  });

  it.each([
    ["/", "/"],
    ["/signals?market=dal", "/signals?market=dal"],
    ["https://evil.example/path", "/"],
    ["//evil.example/path", "/"],
    ["/\\evil.example", "/"],
    [undefined, "/"],
  ])("sanitizes redirect target %s", (value, expected) => {
    expect(sanitizeNextPath(value)).toBe(expected);
  });

  it("renders an escaped dependency-free gate with private response headers", () => {
    const html = renderAccessPage({
      nextPath: "/signals?query=<script>",
      state: "incorrect",
    });

    expect(html).toContain("Private preview");
    expect(html).toContain("Incorrect password");
    expect(html).toContain('action="/api/access"');
    expect(html).toContain("%3Cscript%3E");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("/_next/");
    expect(accessResponseHeaders()).toMatchObject({
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    });
  });
});
