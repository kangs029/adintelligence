import { expect, test } from "./fixtures";
import { join } from "node:path";

const routes = [
  { path: "/", heading: "Market Map" },
  { path: "/competitors", heading: "Competitors" },
  { path: "/signals", heading: "Signals" },
  { path: "/playbook?market=31000US41940", heading: "Playbook" },
];
const shareRoutes = [
  {
    description:
      "Interactive US market map of Asian Indian audience concentration, community anchors, and launch-planning tiers for Xpat.",
    path: "/",
    title: "Market Map · XPAT OS",
  },
  {
    description:
      "USD to INR competitor evidence for live rates, public positioning, ad-capture status, and app-review topic mentions.",
    path: "/competitors",
    title: "Competitors · XPAT OS",
  },
  {
    description:
      "Dated community threads, creator evidence, review pain, and AI-answer visibility for Xpat audience planning.",
    path: "/signals",
    title: "Signals · XPAT OS",
  },
  {
    description:
      "Single-market playbooks with persona fit, channels, counter-move tests, and owned-data proof gates.",
    path: "/playbook?market=31000US41940",
    title: "Playbook · XPAT OS",
  },
  {
    description:
      "Artifact freshness, provenance, source caveats, and methodology behind XPAT OS evidence.",
    path: "/sources",
    title: "Sources · XPAT OS",
  },
];
const overflowRoutes = [...routes, { path: "/sources", heading: "Sources" }];

test("primary nav keeps the evidence arc order", async ({ page }) => {
  await page.goto("/");

  const labels = await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link")
    .evaluateAll((links) => links.map((link) => link.textContent?.replace(/\s+/g, " ").trim()));

  expect(labels).toEqual(["XPAT OS", "Market Map", "Competitors", "Signals", "Playbook", "sources"]);
});

test("all core routes render", async ({ page }) => {
  for (const route of routes) {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { name: route.heading, level: 1 })).toBeVisible();
  }
});

test("share metadata and icons render without missing assets", async ({ page, request }) => {
  for (const route of shareRoutes) {
    const missingAssets: string[] = [];
    page.on("response", (response) => {
      if (response.status() === 404 && /(?:icon|opengraph|twitter)/u.test(response.url())) {
        missingAssets.push(response.url());
      }
    });

    await page.goto(route.path);

    await expect(page).toHaveTitle(route.title);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", route.title);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", route.description);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/og\/xpat-os\.png/u);
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
    await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute("content", "630");
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    await expect(page.locator('meta[name="twitter:description"]')).toHaveAttribute("content", route.description);
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute("content", /\/og\/xpat-os\.png/u);
    await expect(page.locator('link[rel="apple-touch-icon"]').first()).toHaveAttribute("href", /apple-icon/u);
    expect(missingAssets, `${route.path} missing share assets`).toEqual([]);
  }

  for (const asset of ["/favicon.ico", "/icon", "/apple-icon", "/og/xpat-os.png"]) {
    const response = await request.get(asset);
    expect(response.status(), asset).toBeLessThan(400);
  }
});

test("competitor rate table renders a live or snapshot state", async ({ page }) => {
  await page.goto("/competitors");

  await expect(page.getByRole("heading", { name: "Today's position" })).toBeVisible();
  await expect(page.getByText(/Xpat quote pending, see rate check/u)).toBeVisible();
  await expect(page.getByText("Best available quote at $1,000")).toBeVisible();

  const rateSection = page.locator('section[aria-labelledby="rate-table-title"]');
  await expect(rateSection.getByRole("heading", { name: /Rate check/u })).toBeVisible();
  await expect(rateSection.getByText(/LIVE|SNAPSHOT/u).first()).toBeVisible();
  await expect(rateSection.getByRole("row", { name: /Wise/u })).toBeVisible();
  await expect(
    rateSection.getByRole("row", { name: /Wise/u }).getByRole("link", { name: /methodology/u }),
  ).toHaveAttribute("href", "/sources#source-fx-snapshots");
  await expect(rateSection.getByText("Latest provider quote captured")).toBeVisible();
  await expect(rateSection.getByText("Margin vs mid is the gap")).toBeVisible();
  const adSection = page.locator('section[aria-labelledby="ad-evidence-title"]');
  await expect(adSection.locator('img[alt*="public ad capture"]').first()).toBeVisible();
  await expect(adSection.getByRole("heading", { name: "Jun 17, 2026 sweep" })).toBeVisible();
  await expect(adSection.getByRole("heading", { name: "Jul 6, 2026 sweep" })).toBeVisible();
  await expect(adSection.getByText("Xpat, owned benchmark").first()).toBeVisible();
  await expect(adSection.getByText("Public creative proves visible footprint")).toBeVisible();
  await expect(page.locator(".margin-chart circle").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Positioning claims matrix" })).toBeVisible();
});

test("competitor amount toggle recomputes fixed page quotes and keeps Wise amount-specific", async ({
  page,
}) => {
  const fxPayload = {
    corridor: { sourceCurrency: "USD", targetCurrency: "INR", sendAmountUSD: 200 },
    generatedAt: "2026-07-05T08:00:00.000Z",
    provenance: "live",
    midMarket: { rate: 95.3, source: "Frankfurter v2", asOf: "2026-07-05" },
    providers: [
      {
        capturedAt: null,
        caveat:
          "Xpat public pages do not expose a stable machine-readable quote path. A quote endpoint would make this row live. A manually verified quote appears only when rate, fee, receive amount, and capture date are filled.",
        effectiveMarginPctVsMid: null,
        feeUSD: null,
        method: "connector-needed",
        provider: "Xpat",
        quotedRate: null,
        receiveAmountFor1000USD: null,
        sourceUrl: "https://xpat.money/",
        status: "connector-needed",
      },
      {
        capturedAt: "2026-07-05T08:00:00.000Z",
        effectiveMarginPctVsMid: 0.42,
        feeUSD: 0,
        method: "page",
        provider: "Remitly",
        quotedRate: 94.9,
        receiveAmountFor1000USD: 18980,
        sendAmountUSD: 200,
        sourceUrl: "https://wise.com/us/compare/remitly-usd-to-inr",
        status: "snapshot",
      },
      {
        capturedAt: "2026-07-05T08:00:00.000Z",
        effectiveMarginPctVsMid: 1.6,
        feeUSD: 11.26,
        method: "api",
        provider: "Wise",
        quotedRate: 95.33,
        receiveAmountFor1000USD: 18755.74,
        sendAmountUSD: 200,
        sourceUrl: "https://api.wise.com/v3/quotes",
        status: "live",
      },
      {
        capturedAt: "2026-07-05T08:00:00.000Z",
        effectiveMarginPctVsMid: 0.31,
        feeUSD: 0,
        method: "page",
        provider: "Xoom",
        quotedRate: 95.0,
        receiveAmountFor1000USD: 19000,
        sendAmountUSD: 200,
        sourceUrl: "https://wise.com/us/compare/xoom-exchange-rate",
        status: "snapshot",
      },
      {
        capturedAt: null,
        caveat: "Western Union public pages did not expose a stable quote JSON path.",
        effectiveMarginPctVsMid: null,
        feeUSD: null,
        method: "connector-needed",
        provider: "Western Union",
        quotedRate: null,
        receiveAmountFor1000USD: null,
        sourceUrl: "https://www.westernunion.com/us/en/currency-converter/usd-to-inr-rate.html",
        status: "connector-needed",
      },
      {
        capturedAt: null,
        caveat: "No public machine-readable quote path found.",
        effectiveMarginPctVsMid: null,
        feeUSD: null,
        method: "connector-needed",
        provider: "Aspora",
        quotedRate: null,
        receiveAmountFor1000USD: null,
        sourceUrl: "https://www.aspora.com/us",
        status: "connector-needed",
      },
      {
        capturedAt: null,
        caveat: "No public machine-readable quote path found.",
        effectiveMarginPctVsMid: null,
        feeUSD: null,
        method: "connector-needed",
        provider: "Crobo",
        quotedRate: null,
        receiveAmountFor1000USD: null,
        sourceUrl: "https://www.crobo.money/",
        status: "connector-needed",
      },
    ],
  };
  const fxPayload5000 = {
    ...fxPayload,
    corridor: { ...fxPayload.corridor, sendAmountUSD: 5000 },
    providers: fxPayload.providers.map((provider) =>
      provider.receiveAmountFor1000USD === null
        ? provider
        : {
            ...provider,
            effectiveMarginPctVsMid:
              provider.provider === "Wise" ? 2.4 : provider.provider === "Remitly" ? 0.42 : 0.31,
            receiveAmountFor1000USD:
              provider.provider === "Wise"
                ? 465413.74
                : provider.provider === "Remitly"
                  ? 474500
                  : 475000,
            sendAmountUSD: 5000,
          },
    ),
  };

  await page.route("**/api/fx?amount=200", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(fxPayload),
    }),
  );
  await page.route("**/api/fx?amount=5000", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(fxPayload5000),
    }),
  );

  await page.goto("/competitors");
  await expect(page.getByText("Best available quote at $1,000")).toBeVisible();
  await expect(page.getByText(/Xoom, for \$1,000|Remitly, for \$1,000|Wise, for \$1,000/u)).toBeVisible();
  const rateSection = page.locator('section[aria-labelledby="rate-table-title"]');
  await rateSection.getByRole("button", { name: "$200" }).click();

  await expect(rateSection.getByRole("heading", { name: "Rate check · send $200 to India" })).toBeVisible();
  await expect(page.getByText("Best available quote at $1,000")).toBeVisible();
  await expect(rateSection.getByRole("row", { name: /Wise.*1\.60%/u })).toBeVisible();
  await expect(rateSection.getByRole("row", { name: /Remitly.*0\.42%/u })).toBeVisible();
  await expect(
    rateSection.getByRole("row", { name: /Remitly/u }).getByText(
      "Recomputed from the $1,000 public quote, provider tier pricing may differ.",
    ),
  ).toBeVisible();

  await rateSection.getByRole("button", { name: "$5,000" }).click();
  await expect(rateSection.getByRole("heading", { name: "Rate check · send $5,000 to India" })).toBeVisible();
  await expect(page.getByText("Best available quote at $1,000")).toBeVisible();
});

test("playbook deep link renders the selected-market dossier", async ({ page }) => {
  await page.goto("/playbook?market=31000US41940");

  await expect(page.getByRole("heading", { name: "Market wedge" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Market snapshot" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Corridor plays, apply in every market" })).toBeVisible();
  await expect(page.getByText("202,245 ± 5,199")).toBeVisible();
  await expect(page.getByText("Dallas planning comparator").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Creator sponsorship" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where to point digital ads" })).toBeVisible();
  await page.getByRole("button", { name: "Copy geo pack" }).click();
  await expect(page.getByRole("button", { name: "Copied geo pack" })).toBeVisible();
  await expect(page.getByText("Livingston")).toHaveCount(0);
  await expect(page.getByText("Platform routing by persona")).toBeVisible();
  await expect(page.getByText("Public ad libraries show competitor creative, not where it delivers")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Content topics and reply angles" })).toBeVisible();
  await expect(page.getByText("San Jose comparison checklist")).toBeVisible();
  await expect(page.getByText("0 OSM theaters, cinema signal present")).toBeVisible();
  await expect(page.getByText("Measurement proof gate")).toBeVisible();
  await expect(page.getByText("From evidence to proof")).toBeVisible();
  await expect(page.getByText("Claim contract active")).toBeVisible();
});

test("playbook renders target zones for a smaller Tier 2 market", async ({ page }) => {
  await page.goto("/playbook?market=31000US16740");

  await expect(page.getByRole("heading", { name: "Where to point digital ads" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Charlotte", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Matthews", exact: true })).toBeVisible();
  await expect(page.getByText("Unnamed cricket ground").first()).toBeVisible();
  await expect(page.getByText(/cricket \d{6,}/u)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Content topics and reply angles" })).toBeVisible();
});

test("playbook proof gate uploads the sample CSV and shows a labeled sample-demo flip", async ({ page }) => {
  await page.goto("/playbook?market=31000US41940#proof");

  await expect(page.getByText("Sample data for demo")).toBeVisible();
  await expect(page.getByText("upload Xpat-owned CSV")).toBeVisible();
  await page
    .getByLabel("Upload Xpat-owned geo performance CSV")
    .setInputFiles(join(process.cwd(), "public/samples/xpat-proof-gate-sample-data.csv"));

  const status = page.locator(".proof-status");
  await expect(status.getByText("sample demo: already covered")).toBeVisible();
  await expect(status).toContainText("SAMPLE DATA ONLY");
  await expect(page.getByText("Sample mapping preview")).toBeVisible();
  await expect(page.getByText("San Jose-Sunnyvale-Santa Clara row recognized")).toBeVisible();
  await expect(page.locator(".proof-sample-preview")).toContainText("12 demo first_transfers");
  await expect(page.locator(".proof-metrics")).toContainText("Sample first_transfers");
  await expect(page.locator(".proof-metrics")).toContainText("Sample rows loaded");
  await expect(page.locator(".proof-status").getByText("confirmed gap")).not.toBeVisible();
  await expect(page.locator(".proof-metrics").getByText("Unmapped rows")).toBeVisible();
});

test("playbook market hash anchors scroll on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const hash of ["community", "proof", "measurement-proof-gate"]) {
    await page.goto(`/playbook?market=31000US16740#${hash}`);

    await expect(page).toHaveURL(new RegExp(`market=31000US16740.*#${hash}`, "u"));
    await expect(page.getByRole("combobox", { name: "Search markets" })).toHaveValue(
      "Charlotte-Concord-Gastonia, NC",
    );
    await page.waitForFunction((targetHash) => {
      const rawHash = String(targetHash);
      const targetId = rawHash === "proof" ? "proof" : rawHash;
      const element = document.getElementById(targetId);
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.top < window.innerHeight * 0.4;
    }, hash);
  }
});

test("playbook market search opens a non-pinned market", async ({ page }) => {
  await page.goto("/playbook");

  const picker = page.getByRole("combobox", { name: "Search markets" });
  await picker.fill("Seattle");
  await page.getByRole("option", { name: /Seattle-Tacoma-Bellevue, WA/u }).click();

  await expect(page).toHaveURL(/market=31000US42660/u);
  await expect(page.getByRole("heading", { name: "Market snapshot" })).toBeVisible();
  await expect(page.getByText("Seattle-Tacoma-Bellevue", { exact: true }).first()).toBeVisible();
});

test("signals action links route to playbook handoff anchors", async ({ page }) => {
  await page.goto("/signals");
  await page.evaluate(() => window.localStorage.removeItem("xpat-os:last-playbook-market"));

  await page.getByRole("link", { name: "Draft a reply angle in Playbook" }).first().click();
  await expect(page).toHaveURL(/\/playbook\?market=31000US45940#community/u);
  await expect(page.getByRole("heading", { name: "Channel plan" })).toBeVisible();

  await page.goto("/signals");
  await page.getByRole("link", { name: "See creator play" }).first().click();
  await expect(page).toHaveURL(/\/playbook\?market=31000US45940#channels/u);

  await page.goto("/signals");
  await page.getByRole("link", { name: "Route into content play" }).click();
  await expect(page).toHaveURL(/\/playbook\?market=31000US45940#content-seo/u);

  await page.goto("/signals");
  await page.getByRole("link", { name: "Use as messaging angle" }).first().click();
  await expect(page).toHaveURL(/\/playbook\?market=31000US45940#messaging/u);
});

test("signals playbook handoff uses the last selected market and scrolls on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/playbook?market=31000US42660");
  await expect(page.getByText("Seattle-Tacoma-Bellevue", { exact: true }).first()).toBeVisible();

  await page.goto("/signals");
  await page.getByRole("link", { name: "See creator play" }).first().click();

  await expect(page).toHaveURL(/\/playbook\?market=31000US42660#channels/u);
  await expect(page.getByText("Seattle-Tacoma-Bellevue", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Channel plan" })).toBeVisible();

  const anchorTop = await page.locator("#channels").evaluate((element) =>
    Math.round(element.getBoundingClientRect().top),
  );
  expect(Math.abs(anchorTop)).toBeLessThanOrEqual(160);
});

test("walkthrough click path advances through all nine demo steps", async ({ page }) => {
  await page.goto("/?tour=1");

  const tour = page.getByRole("status", { name: "Walkthrough" });
  const next = page.getByRole("button", { name: "Next walkthrough step" });

  for (let step = 1; step <= 9; step += 1) {
    await expect(tour).toContainText(`Step ${step} of 9`);
    await expect(tour).toHaveAttribute("data-tour-step", String(step));

    if (step < 9) {
      await next.click();
      await expect(tour).toHaveAttribute("data-tour-step", String(step + 1));
    }
  }

  await expect(page).toHaveURL(/#from-evidence-to-proof/u);
  await expect(next).toBeDisabled();

  await page.getByRole("button", { name: "Close walkthrough" }).click();
  await expect(page.getByRole("status", { name: "Walkthrough" })).toBeHidden();
  expect(new URL(page.url()).searchParams.get("tour")).toBeNull();
});

test("walkthrough keyboard shortcut advances the step counter", async ({ page }) => {
  await page.goto("/?tour=1");

  const tour = page.getByRole("status", { name: "Walkthrough" });
  await expect(tour).toContainText("Step 1 of 9");

  await page.keyboard.press("ArrowRight");
  await expect(tour).toContainText("Step 2 of 9");
  await expect(page.getByRole("complementary", { name: /San Jose/u })).toBeVisible();

  await page.getByRole("button", { name: "Close walkthrough" }).click();
  await expect(page.getByRole("status", { name: "Walkthrough" })).toBeHidden();
  expect(new URL(page.url()).searchParams.get("tour")).toBeNull();
});

test("walkthrough controls stay tappable in the mobile safe area", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?tour=1");

  const tour = page.getByRole("status", { name: "Walkthrough" });
  const next = page.getByRole("button", { name: "Next walkthrough step" });
  const close = page.getByRole("button", { name: "Close walkthrough" });

  for (let step = 1; step <= 9; step += 1) {
    await expect(tour).toContainText(`Step ${step} of 9`);

    const tourBox = await tour.boundingBox();
    const closeBox = await close.boundingBox();
    expect(tourBox, `step ${step} tour box`).toBeTruthy();
    expect(closeBox, `step ${step} close box`).toBeTruthy();
    expect((tourBox?.y ?? 0) + (tourBox?.height ?? 0), `step ${step} tour bottom`).toBeLessThanOrEqual(844);
    expect((closeBox?.y ?? 0) + (closeBox?.height ?? 0), `step ${step} close bottom`).toBeLessThanOrEqual(844);

    if (step < 9) {
      const nextBox = await next.boundingBox();
      expect(nextBox, `step ${step} next box`).toBeTruthy();
      expect((nextBox?.y ?? 0) + (nextBox?.height ?? 0), `step ${step} next bottom`).toBeLessThanOrEqual(844);
      await next.click();
      await expect(tour).toHaveAttribute("data-tour-step", String(step + 1));
    }
  }
});

test("footer freshness table links to the generated sources page", async ({ page }) => {
  await page.goto("/");

  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "sources" })).toHaveAttribute("href", "/sources");
  await expect(footer.getByRole("table")).toContainText("markets");
  await expect(footer.getByRole("table")).toContainText("fx-snapshots");

  await footer.getByRole("link", { name: "sources" }).click();
  await expect(page.getByRole("heading", { name: "Sources", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "markets-geojson" })).toBeVisible();
  await expect(page.getByText("Public FX quotes do not prove conversion")).toBeVisible();
});

test("core routes avoid page-level horizontal overflow on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });

  for (const route of overflowRoutes) {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { name: route.heading, level: 1 })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow, `${route.path} overflow px`).toBeLessThanOrEqual(1);
  }
});
