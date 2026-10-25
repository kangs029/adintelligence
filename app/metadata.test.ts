import { describe, expect, it, vi } from "vitest";

vi.mock("geist/font/mono", () => ({ GeistMono: { variable: "geist-mono" } }));
vi.mock("geist/font/sans", () => ({ GeistSans: { variable: "geist-sans" } }));

const pageModules = [
  {
    description:
      "Interactive US market map of Asian Indian audience concentration, community anchors, and launch-planning tiers for Xpat.",
    path: "./page",
    title: "Market Map · XPAT OS",
  },
  {
    description:
      "USD to INR competitor evidence for live rates, public positioning, ad-capture status, and app-review topic mentions.",
    path: "./competitors/page",
    title: "Competitors · XPAT OS",
  },
  {
    description:
      "Dated community threads, creator evidence, review pain, and AI-answer visibility for Xpat audience planning.",
    path: "./signals/page",
    title: "Signals · XPAT OS",
  },
  {
    description:
      "Single-market playbooks with persona fit, channels, counter-move tests, and owned-data proof gates.",
    path: "./playbook/page",
    title: "Playbook · XPAT OS",
  },
  {
    description:
      "Artifact freshness, provenance, source caveats, and methodology behind XPAT OS evidence.",
    path: "./sources/page",
    title: "Sources · XPAT OS",
  },
];

describe("page metadata", () => {
  it.each(pageModules)("exports a specific preview for $path", async ({ description, path, title }) => {
    const mod = await import(path);

    expect(mod.metadata).toMatchObject({
      description,
      title,
      openGraph: {
        description,
        title,
      },
      twitter: {
        description,
        title,
      },
    });
  });

  it("defines share metadata and app icons at the root", async () => {
    const mod = await import("./layout");

    expect(mod.metadata).toMatchObject({
      applicationName: "XPAT OS",
      metadataBase: new URL("https://xpat-os.vercel.app"),
      openGraph: {
        images: [
          {
            alt: "XPAT OS audience intelligence preview",
            height: 630,
            url: "/og/xpat-os.png",
            width: 1200,
          },
        ],
        siteName: "XPAT OS",
        title: "XPAT OS",
        type: "website",
        url: "https://xpat-os.vercel.app",
      },
      twitter: {
        card: "summary_large_image",
        images: [
          {
            alt: "XPAT OS audience intelligence preview",
            height: 630,
            url: "/og/xpat-os.png",
            width: 1200,
          },
        ],
        title: "XPAT OS",
      },
    });
    expect(mod.metadata.icons).toMatchObject({
      apple: [{ url: "/apple-icon" }],
      icon: [{ url: "/icon" }],
    });
  });
});
