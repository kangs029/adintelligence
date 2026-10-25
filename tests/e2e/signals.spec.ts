import { expect, test } from "./fixtures";

test("signals mobile KPI strip avoids nested horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/signals");

  await expect(page.getByRole("heading", { name: "Signals", level: 1 })).toBeVisible();
  const statusStrip = page.getByLabel("Signals status");
  await expect(statusStrip.getByText("Review excerpts mined")).toBeVisible();
  await expect(statusStrip.getByText("Community threads")).toBeVisible();
  await expect(statusStrip.getByText("Creators identified")).toBeVisible();
  await expect(statusStrip.getByText("AI answers captured")).toBeVisible();

  const overflow = await page.locator(".signals-page .kpi-strip").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));

  expect(overflow.scrollWidth - overflow.clientWidth).toBeLessThanOrEqual(1);
});

test("signals labels API refresh access without leaking raw env vars", async ({ page }) => {
  await page.goto("/signals");

  await expect(page.getByText("Reddit API access makes this live-refreshable")).toBeVisible();
  await expect(page.getByText("YouTube API access makes this live-refreshable")).toBeVisible();
  await expect(page.getByText("REDDIT_CLIENT_SECRET")).toBeHidden();
  await expect(page.getByText("YOUTUBE_API_KEY")).toBeHidden();
});

test("signals exposes content topics and keeps pending AI capture compact", async ({ page }) => {
  await page.goto("/signals");

  await expect(page.getByRole("heading", { name: "Content topics and reply angles" })).toBeVisible();
  await expect(page.getByText("Human review still happens before publishing.")).toBeVisible();
  await expect(page.getByText("AI answer benchmark setup")).toBeVisible();
  await expect(page.getByText("Capture pending for the full benchmark")).toBeVisible();
  await expect(page.getByText("0 of 0")).toHaveCount(0);
  await expect(page.getByText("0 of 20")).toHaveCount(0);
  await expect(page.locator(".geo-grid")).toHaveCount(0);
});

test("signals has no placeholder hrefs", async ({ page }) => {
  await page.goto("/signals");

  const placeholderHrefs = await page.locator("main.signals-page a").evaluateAll((links) =>
    links
      .map((link) => link.getAttribute("href") ?? "")
      .filter((href) =>
        href === "" ||
        href === "#" ||
        href.startsWith("#") ||
        /^javascript:/iu.test(href) ||
        /example\.com|placeholder|todo/iu.test(href),
      ),
  );

  expect(placeholderHrefs).toEqual([]);
});

test("signals thread filters show a recoverable empty state", async ({ page }) => {
  await page.goto("/signals");

  await page.locator(".thread-filters select").nth(2).selectOption("Crobo");
  await expect(page.getByText("No community threads match competitor Crobo.")).toBeVisible();
  await expect(page.getByText("Clear filters or choose All")).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("heading", { name: "Recent (60d)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Historical" })).toBeVisible();
});
