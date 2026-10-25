# 07: Shared Password Access Gate

## Purpose

The application-level gate keeps an internal capability demo out of casual
public access. It is intentionally simpler than user authentication.

It must block:

- Pages
- API routes
- Public files and images
- Open Graph assets
- Next.js assets

The only public application endpoint is `POST /api/access`, which accepts the
password form and serves no product evidence.

## Request flow

The root `proxy.ts` runs for every incoming path:

1. Read the server-only `XPAT_ACCESS_PASSWORD`.
2. Return a fail-closed `503` response when it is absent.
3. Read and validate the access cookie.
4. Continue only when the cookie signature and signed expiry are valid.
5. Otherwise return the self-contained password screen.

The password screen uses inline HTML and CSS so it does not depend on protected
application assets.

`POST /api/access`:

1. Compares the submitted and configured passwords in constant time.
2. Rejects an incorrect password with `401`.
3. Sanitizes `next` to a same-origin relative path.
4. Sets the access cookie and redirects with `303`.
5. Never logs, returns, stores, or serializes the submitted password.

## Cookie design

The cookie contains:

- A token version
- A signed expiry timestamp
- An HMAC-SHA256 signature derived from the configured password

It does not contain the password. The server validates the signed expiry, so
the seven-day lifetime is not controlled only by the browser.

Cookie attributes:

- `HttpOnly`
- `Secure` in deployed environments
- `SameSite=Lax`
- `Path=/`
- Seven-day maximum age
- No `Domain` attribute

Changing `XPAT_ACCESS_PASSWORD` invalidates existing sessions.

## Cache and indexing posture

Gate responses use:

- `Cache-Control: no-store`
- `X-Robots-Tag: noindex, nofollow, noarchive`

The password screen also includes equivalent robots metadata.

## Environment configuration

Set one server-only variable:

```text
XPAT_ACCESS_PASSWORD=<strong shared passphrase>
```

Configure it in local ignored environment files and in both Preview and
Production deployment scopes. Never commit the value and never expose it through
a `NEXT_PUBLIC_` variable.

## Required verification

- Missing configuration returns `503`.
- Wrong password returns `401` and sets no cookie.
- Correct password returns `303` with the expected cookie attributes.
- Unsafe redirect targets fall back to `/`.
- Unauthenticated page, API, asset, image, and Next.js requests reveal no
  protected content.
- Password rotation invalidates an earlier cookie.
- Authenticated navigation and runtime APIs still work.
- Gate responses remain `no-store` and `noindex`.

Relevant automated coverage:

- `lib/access/access-gate.test.ts`
- `proxy.test.ts`
- `app/api/access/route.test.ts`
- `tests/e2e/access-gate.spec.ts`

## Security boundary

This gate is suitable for a private prototype containing public and curated
evidence. It is not sufficient for:

- Customer-identifiable data
- Regulated financial information
- Production account access
- Role-based application permissions
- Audit-sensitive workflows

Before adding those data classes, replace the shared gate with individual
identity, authorization, audit logging, data retention controls, and a reviewed
data-access architecture.

Code-level gating protects deployments built from the gating commit forward. It
cannot retroactively protect immutable deployments produced by earlier commits.
Inventory and remove obsolete pre-gate deployments before claiming every
historical URL is private.
