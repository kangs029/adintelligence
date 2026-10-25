import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ACCESS_COOKIE_NAME = "xpat_access";
export const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

const ACCESS_TOKEN_MESSAGE = "xpat-os-access-v1";
const ACCESS_TOKEN_VERSION = "v1";
const ROBOTS_VALUE = "noindex, nofollow, noarchive";

type AccessEnvironment = Readonly<Record<string, string | undefined>>;

type AccessPageState = "prompt" | "incorrect" | "unavailable";

export function readAccessPassword(
  env: AccessEnvironment = process.env,
): string | null {
  const password = env.XPAT_ACCESS_PASSWORD;

  return password && password.trim().length > 0 ? password : null;
}

function deriveAccessSignature(
  password: string,
  expiresAtSeconds: number,
): string {
  return createHmac("sha256", password)
    .update(`${ACCESS_TOKEN_MESSAGE}:${expiresAtSeconds}`)
    .digest("base64url");
}

export function deriveAccessToken(
  password: string,
  issuedAtMs = Date.now(),
): string {
  const expiresAtSeconds =
    Math.floor(issuedAtMs / 1_000) + ACCESS_COOKIE_MAX_AGE;
  const signature = deriveAccessSignature(password, expiresAtSeconds);

  return `${ACCESS_TOKEN_VERSION}.${expiresAtSeconds}.${signature}`;
}

export function secureEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();

  return timingSafeEqual(leftDigest, rightDigest);
}

export function isAccessCookieValid(
  cookie: string | undefined,
  password: string,
  nowMs = Date.now(),
): boolean {
  if (!cookie) {
    return false;
  }

  const [version, expiresAtValue, signature, ...extraParts] = cookie.split(".");
  if (
    version !== ACCESS_TOKEN_VERSION ||
    !expiresAtValue ||
    !signature ||
    extraParts.length > 0 ||
    !/^\d+$/u.test(expiresAtValue)
  ) {
    return false;
  }

  const expiresAtSeconds = Number(expiresAtValue);
  if (
    !Number.isSafeInteger(expiresAtSeconds) ||
    expiresAtSeconds <= Math.floor(nowMs / 1_000)
  ) {
    return false;
  }

  return secureEqual(
    signature,
    deriveAccessSignature(password, expiresAtSeconds),
  );
}

export function sanitizeNextPath(value: string | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/";
  }

  try {
    const url = new URL(value, "https://xpat.local");
    return url.origin === "https://xpat.local"
      ? `${url.pathname}${url.search}`
      : "/";
  } catch {
    return "/";
  }
}

export function accessResponseHeaders(): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8",
    "X-Robots-Tag": ROBOTS_VALUE,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderAccessPage({
  nextPath = "/",
  state = "prompt",
}: {
  nextPath?: string;
  state?: AccessPageState;
} = {}): string {
  const unavailable = state === "unavailable";
  const message = unavailable
    ? "Access is temporarily unavailable."
    : state === "incorrect"
      ? "Incorrect password."
      : "Enter the shared password to continue.";
  const form = unavailable
    ? ""
    : `
      <form method="post" action="/api/access">
        <input type="hidden" name="next" value="${escapeHtml(sanitizeNextPath(nextPath))}">
        <label for="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
          autofocus
        >
        <button type="submit">Continue</button>
      </form>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow,noarchive">
    <title>Private preview | Xpat OS</title>
    <style>
      :root { color-scheme: dark; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
      * { box-sizing: border-box; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; background: #080c11; color: #e7edf4; }
      main { width: min(100%, 420px); border: 1px solid #26313d; border-radius: 14px; padding: 28px; background: #0e141b; box-shadow: 0 24px 80px rgb(0 0 0 / 35%); }
      .eyebrow { margin: 0 0 24px; color: #5eead4; font-size: 12px; font-weight: 700; letter-spacing: .16em; }
      h1 { margin: 0; font-size: clamp(26px, 7vw, 36px); letter-spacing: -.04em; }
      .message { min-height: 21px; margin: 12px 0 24px; color: #94a3b8; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 14px; line-height: 1.5; }
      form { display: grid; gap: 12px; }
      label { color: #cbd5e1; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      input { width: 100%; border: 1px solid #334155; border-radius: 9px; padding: 12px 13px; background: #080c11; color: #f8fafc; font: inherit; outline: none; }
      input:focus { border-color: #5eead4; box-shadow: 0 0 0 3px rgb(94 234 212 / 12%); }
      button { margin-top: 4px; border: 1px solid #5eead4; border-radius: 9px; padding: 12px 16px; background: #5eead4; color: #07120f; font: inherit; font-weight: 800; cursor: pointer; }
      button:hover { background: #99f6e4; }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">XPAT OS</p>
      <h1>Private preview</h1>
      <p class="message" role="status">${message}</p>
      ${form}
    </main>
  </body>
</html>`;
}
