import { expect, test } from "@playwright/test";

const accessPassword =
  process.env.XPAT_ACCESS_PASSWORD ?? "xpat-e2e-access-password";

test("blocks every public surface until the shared password is accepted", async ({
  baseURL,
  browser,
}) => {
  expect(baseURL).toBeTruthy();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  for (const path of [
    "/",
    "/competitors",
    "/signals",
    "/playbook",
    "/sources",
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(401);
    await expect(
      page.getByRole("heading", { name: "Private preview" }),
    ).toBeVisible();
    await expect(page.locator(".app-shell")).toHaveCount(0);
  }

  for (const path of [
    "/api/fx",
    "/og/xpat-os.png",
    "/_next/static/chunks/app.js",
  ]) {
    const response = await context.request.get(path);
    expect(response.status(), path).toBe(401);
    expect(await response.text(), path).toContain("Private preview");
  }

  const unsupported = await context.request.get("/api/access");
  expect(unsupported.status()).toBe(405);

  const rejected = await context.request.post("/api/access", {
    form: { password: "wrong password", next: "/signals?from=gate" },
    maxRedirects: 0,
  });
  expect(rejected.status()).toBe(401);
  expect(await rejected.text()).toContain("Incorrect password");
  expect(await context.cookies()).toHaveLength(0);

  const accepted = await context.request.post("/api/access", {
    form: { password: accessPassword, next: "/signals?from=gate" },
    maxRedirects: 0,
  });
  expect(accepted.status()).toBe(303);
  const redirect = new URL(accepted.headers().location);
  expect(`${redirect.pathname}${redirect.search}`).toBe("/signals?from=gate");

  const [cookie] = await context.cookies();
  expect(cookie).toMatchObject({
    httpOnly: true,
    name: "xpat_access",
    sameSite: "Lax",
  });

  await page.goto("/signals?from=gate");
  await expect(page.getByRole("heading", { name: "Signals", level: 1 })).toBeVisible();

  await page.goto("/competitors");
  const evidenceImage = page.locator('img[alt*="public ad capture"]').first();
  await expect(evidenceImage).toBeVisible();
  await expect(evidenceImage).not.toHaveAttribute("src", /\/_next\/image/u);

  const asset = await context.request.get("/og/xpat-os.png");
  expect(asset.status()).toBe(200);

  await context.close();
});
