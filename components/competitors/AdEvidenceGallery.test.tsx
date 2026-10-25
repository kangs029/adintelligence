import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { findCopyViolations } from "../../scripts/check-copy.mjs";
import { AdEvidenceGallery } from "./AdEvidenceGallery";
import { PositioningMatrix } from "./PositioningMatrix";

const adArtifact = {
  data: {
    records: [
      {
        bodyText: null,
        capturedAt: "2026-07-03T10:00:00.000Z",
        caveat: "Meta Ad Library returned no active public ad cards for this query.",
        competitor: "Remitly",
        firstSeen: null,
        headline: null,
        id: "meta-remitly-2026-07-03",
        mediaType: null,
        platform: "Meta",
        screenshotPath: null,
        sourceUrl: "https://www.facebook.com/ads/library/?q=Remitly",
        status: "no-public-ads-captured",
        themes: [],
      },
      {
        bodyText: null,
        capturedAt: "2026-07-03T10:00:00.000Z",
        caveat: "Meta Ad Library returned no active public ad cards for this query.",
        competitor: "Wise",
        firstSeen: null,
        headline: null,
        id: "meta-wise-2026-07-03",
        mediaType: null,
        platform: "Meta",
        screenshotPath: null,
        sourceUrl: "https://www.facebook.com/ads/library/?q=Wise",
        status: "no-public-ads-captured",
        themes: [],
      },
    ],
    window: { from: "2026-06-04", to: "2026-07-03" },
  },
};

const capturedAdArtifact = {
  data: {
    records: [
      {
        bodyText: null,
        brand: "Xpat / Remit2Any",
        capturedAt: "2026-06-17",
        caveat: null,
        competitor: "Xpat",
        evidenceRole: "owned benchmark",
        firstSeen: null,
        headline: "Send Money from USD to INR - Instant Transfers With $0 Fees",
        id: "v1-ad_google_xpat_001",
        lastShown: null,
        mediaType: "Google Search",
        placement: null,
        platform: "Google",
        screenshotPath: "/evidence/ads/june-2026/xpat-google-cr08845692618802200577.png",
        sourceUrl:
          "https://adstransparency.google.com/advertiser/AR05946074718833475585/creative/CR08845692618802200577?region=US",
        status: "snapshot",
        sweepLabel: "Jun 17, 2026 sweep",
        themes: ["owned benchmark"],
      },
      {
        bodyText: null,
        brand: "MoneyGram",
        capturedAt: "2026-06-17",
        caveat:
          "V1 retained this PNG capture without a structured sampleAd row; advertiser and source URL are derived from the filename and matching v1 observation.",
        competitor: "MoneyGram",
        evidenceRole: "category context",
        firstSeen: null,
        headline: null,
        id: "v1-moneygram_google_cr09972801713557471233",
        lastShown: null,
        mediaType: "Google creative",
        placement: null,
        platform: "Google",
        screenshotPath: "/evidence/ads/june-2026/moneygram-google-cr09972801713557471233.png",
        sourceUrl:
          "https://adstransparency.google.com/advertiser/AR05219241646759084033/creative/CR09972801713557471233?region=US",
        status: "snapshot",
        sweepLabel: "Jun 17, 2026 sweep",
        themes: ["category context"],
      },
      {
        bodyText: "Pay vendors across borders quickly, with low fees and clear pricing.",
        capturedAt: "2026-07-06T10:00:00.000Z",
        caveat: null,
        competitor: "Remitly",
        firstSeen: "2026-06-17",
        headline: "Pay vendors across borders quickly, with low fees and clear pricing.",
        id: "meta-remitly-1750307983002636",
        mediaType: null,
        placement: null,
        platform: "Meta",
        screenshotPath: "/evidence/ads/remitly/meta-1750307983002636.png",
        screenshotRawPath: "data/raw/ads/remitly/meta-1750307983002636.png",
        sourceUrl: "https://www.facebook.com/ads/library/?id=1750307983002636",
        status: "snapshot",
        themes: [],
      },
      {
        bodyText: null,
        capturedAt: "2026-07-06T10:00:00.000Z",
        caveat: "Google Ads Transparency Center returned no public ad cards for this advertiser.",
        competitor: "Wise",
        firstSeen: null,
        headline: null,
        id: "google-wise-2026-07-06",
        mediaType: null,
        placement: null,
        platform: "Google",
        screenshotPath: null,
        sourceUrl: "https://adstransparency.google.com/?region=US&domain=wise.com",
        status: "no-public-ads-captured",
        themes: [],
      },
    ],
    window: { from: "2026-06-07", to: "2026-07-06" },
  },
};

const positioningCuration = {
  meta: {
    capturedAt: "2026-07-05T03:03:21.097Z",
    note: "Curated from the committed positioning artifact.",
  },
  providers: [
    {
      capturedAt: "2026-07-05T03:03:21.097Z",
      claims: {
        differentiator: "India-focused support and published rates.",
        feeClaim: "Zero fees, best rates, and complete peace of mind.",
        introOffer: "US-to-US transfers at zero cost.",
        speedClaim: "Bank credit in less than 10 minutes.",
      },
      provider: "Xpat",
      screenshotRawPath: "data/raw/positioning/xpat.png",
      sourceUrl: "https://xpat.money/",
    },
    {
      capturedAt: "2026-07-05T03:03:21.097Z",
      claims: {
        differentiator: "Delivery options and transfer tracking.",
        feeClaim: "No hidden fees.",
        introOffer: "Limited time offer.",
        speedClaim: "Delivery time guaranteed.",
      },
      provider: "Remitly",
      screenshotRawPath: "data/raw/positioning/remitly.png",
      sourceUrl: "https://www.remitly.com/us/en/india",
    },
  ],
};

describe("competitor evidence UI", () => {
  it("renders one compact no-capture ad strip with the public creative boundary line", () => {
    const html = renderToStaticMarkup(<AdEvidenceGallery artifact={adArtifact} />);

    expect(html).toContain("Ad evidence");
    expect(html).toContain("0 public ads captured, manual screenshot evidence pass pending");
    expect(html).toContain("Swept competitors: Remitly, Wise");
    expect(html.match(/manual screenshot evidence pass pending/g)).toHaveLength(1);
    expect(html).toContain("Public creative proves visible footprint");
    expect(findCopyViolations(html, "components/competitors/AdEvidenceGallery.tsx")).toEqual([]);
  });

  it("renders captured public ad screenshots without the empty strip", () => {
    const html = renderToStaticMarkup(<AdEvidenceGallery artifact={capturedAdArtifact} />);

    expect(html).toContain("Pay vendors across borders quickly, with low fees and clear pricing.");
    expect(html).toContain("Jun 17, 2026 sweep");
    expect(html).toContain("Jul 6, 2026 sweep");
    expect(html).toContain("Xpat, owned benchmark");
    expect(html).toContain("category context, not USD to INR proof");
    expect(html).toContain(
      "Screenshot retained from the June 2026 evidence port. Text unavailable in public DOM.",
    );
    expect(html).toContain("external link");
    expect(html).toContain("Remitly Meta public ad capture");
    expect(html).toContain("First seen 2026-06-17");
    expect(html).toContain("Sources with no captured public ad card in this pass");
    expect(html).not.toContain("structured sampleAd row");
    expect(html).not.toContain("derived from the filename");
    expect(html).not.toContain("0 public ads captured, manual screenshot evidence pass pending");
    expect(findCopyViolations(html, "components/competitors/AdEvidenceGallery.tsx")).toEqual([]);
  });

  it("renders a curated positioning claims matrix with evidence links", () => {
    const html = renderToStaticMarkup(<PositioningMatrix curation={positioningCuration} />);

    expect(html).toContain("Positioning claims matrix");
    expect(html).toContain("Intro offer");
    expect(html).toContain("Differentiator");
    expect(html).toContain("US-to-US transfers at zero cost.");
    expect(html).toContain("data/raw/positioning/xpat.png");
    expect(html).toContain(
      "Aspora and Crobo already press the Google-rate, zero-fee NRI lane. Xpat needs transparent rate proof plus India-first support evidence to stand apart.",
    );
    expect(findCopyViolations(html, "components/competitors/PositioningMatrix.tsx")).toEqual([]);
  });
});
