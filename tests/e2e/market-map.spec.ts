import { expect, test, type Page } from "./fixtures";

declare global {
  interface Window {
    __xpatMapDebug?: {
      anchorPoints: Array<{
        id: string;
        x: number;
        y: number;
        lng: number;
        lat: number;
        name: string;
      }>;
      basemapPlaceDotLayerIds: string[];
      center?: { lng: number; lat: number };
      focusedAnchorId?: string;
      visibleMarketCount: number;
    };
  }
}

async function waitForMapDebug(page: Page) {
  await expect(page.getByTestId("market-map")).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => Boolean(window.__xpatMapDebug));
}

test("server-rendered root HTML includes static market evidence", async ({ request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);

  const html = await response.text();
  expect(html).toContain("Launch planning evidence");
  expect(html).toContain("Why Tier 1");
  expect(html).toContain("Trenton-Princeton");
  expect(html).toContain("San Jose-Sunnyvale-Santa Clara");
  expect(html).toContain("Open playbook");
  expect(html).not.toContain("If the interactive map has not loaded");
  expect(html).not.toContain("Static evidence fallback");
  expect(html).not.toContain("Loading market map");
});

test("server-rendered tour URL keeps the evidence fallback readable", async ({ request }) => {
  const response = await request.get("/?tour=1");
  expect(response.ok()).toBe(true);

  const html = await response.text();
  expect(html).toContain("Launch planning evidence");
  expect(html).toContain("The guided walkthrough starts in the interactive map experience.");
  expect(html).toContain("Trenton-Princeton");
  expect(html).not.toContain("If the interactive map has not loaded");
  expect(html).not.toContain("Loading market map");
});

test("root map loads without conditional fallback flash or console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/");
  await expect(page.getByTestId("market-map")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("If the interactive map has not loaded")).toHaveCount(0);
  await expect(page.getByText("Static evidence fallback")).toHaveCount(0);
  await expect(page.locator(".map-stage-pending")).toHaveCount(0);

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("map routes have a clean console", async ({ page }) => {
  for (const path of ["/", "/?market=31000US41940"]) {
    const consoleIssues: string[] = [];
    const pageErrors: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        consoleIssues.push(`${message.type()}: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    await page.goto(path);
    await expect(page.getByTestId("market-map")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1_500);

    expect(pageErrors, `${path} page errors`).toEqual([]);
    expect(
      consoleIssues.filter((issue) => /maplibre|glyph|sprite|circle-11|uncaught/i.test(issue)),
      `${path} MapLibre console issues`,
    ).toEqual([]);

    page.removeAllListeners("console");
    page.removeAllListeners("pageerror");
  }
});

test("deep link opens the San Jose market drawer", async ({ page }) => {
  await page.goto("/?market=31000US41940");

  const drawer = page.getByRole("complementary", {
    name: /San Jose-Sunnyvale-Santa Clara market evidence/u,
  });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "Population" })).toBeVisible();
  await expect(drawer.getByText("202,245 ± 5,199")).toBeVisible();
  await expect(drawer.getByRole("heading", { name: /Community anchors/u })).toBeVisible();
  await expect(drawer.getByText(/theater signals, city level/u)).toBeVisible();
  await expect(drawer.getByText("What this mix suggests")).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "Employment proxy" })).toBeVisible();
  await expect(drawer.getByText("H-1B employer filings (LCA), FY2026")).toBeVisible();
  await expect(drawer.getByText(/Cinema snapshot/u)).toBeVisible();
  await expect(drawer.getByText(/employer\/workforce proxy/u)).toBeVisible();
  await expect(drawer.getByRole("link", { name: /Open playbook/u })).toHaveAttribute(
    "href",
    "/playbook?market=31000US41940#market-snapshot",
  );
  await expect(page).toHaveURL(/market=31000US41940/u);
});

test("Seattle anchors render as symbols, show tooltip, and focus from drawer rows", async ({
  page,
}) => {
  await page.goto("/?market=31000US42660");

  const drawer = page.getByRole("complementary", {
    name: /Seattle-Tacoma-Bellevue market evidence/u,
  });
  await expect(drawer).toBeVisible();
  await expect(page.getByLabel("Selected market anchor legend")).toBeVisible();
  await expect(
    page.getByText("Anchors are community places: temples, Indian groceries, cricket grounds, theaters."),
  ).toBeVisible();
  await page.waitForFunction(() => (window.__xpatMapDebug?.center?.zoom ?? 0) >= 7.5);

  const focusButton = drawer.getByRole("button", { name: /^Focus .+ on map$/u }).first();
  const buttonLabel = await focusButton.getAttribute("aria-label");
  const buttonAnchorName = buttonLabel
    ?.replace(/^Focus /u, "")
    .replace(/ on map$/u, "");
  expect(buttonAnchorName).toBeTruthy();

  const anchor = await page.waitForFunction((name) => {
    return (
      window.__xpatMapDebug?.anchorPoints?.find((point) =>
        String(name).startsWith(point.name),
      ) ?? null
    );
  }, buttonAnchorName);
  const firstAnchor = await anchor.jsonValue<{
    id: string;
    x: number;
    y: number;
    lng: number;
    lat: number;
    name: string;
  }>();

  expect(firstAnchor.id).toBeTruthy();
  const mapBox = await page.getByTestId("market-map").boundingBox();
  expect(mapBox).toBeTruthy();
  const hoverAnchor = await page.waitForFunction((coveredWidth) => {
    return (
      window.__xpatMapDebug?.anchorPoints?.find(
        (point) =>
          point.x > 16 &&
          point.y > 16 &&
          point.x < window.innerWidth - Number(coveredWidth) &&
          point.y < window.innerHeight - 16,
      ) ?? null
    );
  }, 460);
  const hoverPoint = await hoverAnchor.jsonValue<{
    x: number;
    y: number;
    name: string;
  }>();
  await page.mouse.move((mapBox?.x ?? 0) + hoverPoint.x, (mapBox?.y ?? 0) + hoverPoint.y);
  const tooltip = page.getByRole("status");
  await expect(tooltip).toContainText("OSM");
  await expect(tooltip).toContainText(/Temple|Grocery|Cricket|Theater/u);
  expect((await tooltip.textContent())?.trim().length ?? 0).toBeGreaterThan(8);

  const before = await page.evaluate(() => window.__xpatMapDebug?.center);
  await focusButton.click();
  await page.waitForFunction(
    ({ id, lat, lng }) =>
      window.__xpatMapDebug?.focusedAnchorId === id &&
      Math.abs((window.__xpatMapDebug.center?.lat ?? 0) - lat) < 0.2 &&
      Math.abs((window.__xpatMapDebug.center?.lng ?? 0) - lng) < 0.2,
    firstAnchor,
  );
  const after = await page.evaluate(() => window.__xpatMapDebug?.center);

  expect(before).toBeTruthy();
  expect(after?.lng).toBeCloseTo(firstAnchor.lng, 1);
  expect(after?.lat).toBeCloseTo(firstAnchor.lat, 1);
});

test("mobile map appears before collapsible filters", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/");

  const mapStage = page.getByLabel("Interactive market map");
  const filterToggle = page.getByRole("button", { name: /Filters/u });
  const mapKpis = page.locator(".map-kpis");

  await expect(mapStage).toBeVisible();
  await expect(filterToggle).toBeVisible();
  await expect(mapKpis).toBeVisible();
  await expect(page.getByRole("heading", { name: "Market tier" })).toBeHidden();

  const mapBox = await mapStage.boundingBox();
  const toggleBox = await filterToggle.boundingBox();
  expect(mapBox?.y ?? 0).toBeLessThan(toggleBox?.y ?? 0);
  expect((mapBox?.y ?? 901) < 900).toBe(true);

  const layout = await page.evaluate(() => {
    const kpis = document.querySelector(".map-kpis");
    return {
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      kpiScrolls: kpis ? kpis.scrollWidth > kpis.clientWidth : false,
    };
  });
  expect(layout.pageOverflow).toBeLessThanOrEqual(1);
  expect(layout.kpiScrolls).toBe(true);

  await filterToggle.click();
  await expect(page.getByRole("heading", { name: "Market tier" })).toBeVisible();
});

test("map filter fields have stable ids and names", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#market-state-filter")).toHaveAttribute("name", "market-state");
  await expect(page.locator("#market-population-filter")).toHaveAttribute(
    "name",
    "market-min-population",
  );
});

test("growth-only filter explains markets hidden by the population slider", async ({ page }) => {
  await page.goto("/");
  await waitForMapDebug(page);

  await page.getByRole("button", { name: /Launch planning/u }).click();
  await page.getByRole("button", { name: /Discovery/u }).click();
  await page.waitForFunction(() => window.__xpatMapDebug?.visibleMarketCount === 6);
  await expect(page.locator("#market-population-filter")).toHaveValue("0");

  await page.locator("#market-population-filter").evaluate((element) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, "10000");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await expect(
    page.getByText("4 growth markets hidden by the population filter."),
  ).toBeVisible();
  await page.waitForFunction(() => window.__xpatMapDebug?.visibleMarketCount === 2);

  await page.getByRole("button", { name: "Show them" }).click();
  await expect(page.locator("#market-population-filter")).toHaveValue("0");
  await expect(
    page.getByText("4 growth markets hidden by the population filter."),
  ).toBeHidden();
  await page.waitForFunction(() => window.__xpatMapDebug?.visibleMarketCount === 6);
});

test("deselecting all tiers leaves only the quiet labeled basemap", async ({ page }) => {
  await page.goto("/");
  await waitForMapDebug(page);

  await page.getByRole("button", { name: /Launch planning/u }).click();
  await page.getByRole("button", { name: /Growth/u }).click();
  await page.getByRole("button", { name: /Discovery/u }).click();

  await page.waitForFunction(() => window.__xpatMapDebug?.visibleMarketCount === 0);
  expect(await page.evaluate(() => window.__xpatMapDebug?.basemapPlaceDotLayerIds)).toEqual([]);
});

test("map KPIs do not collide with the desktop drawer", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 820 });
  await page.goto("/?market=31000US41940");

  await expect(page.getByRole("complementary", { name: /San Jose/u })).toBeVisible();
  await expect(page.locator(".map-kpis")).toBeHidden();

  const layout = await page.evaluate(() => {
    const mapStage = document.querySelector(".map-stage")?.getBoundingClientRect();
    const drawer = document.querySelector(".market-drawer")?.getBoundingClientRect();

    return {
      drawerBottom: drawer?.bottom ?? 0,
      drawerTop: drawer?.top ?? 0,
      mapBottom: mapStage?.bottom ?? 0,
      mapTop: mapStage?.top ?? 0,
    };
  });

  expect(layout.drawerTop).toBeGreaterThanOrEqual(layout.mapTop);
  expect(layout.drawerBottom).toBeLessThanOrEqual(layout.mapBottom);
});
