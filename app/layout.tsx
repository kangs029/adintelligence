import type { Metadata } from "next";
import { Suspense } from "react";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { AdAnalystModal } from "@/components/shell/AdAnalystModal";
import { EvidenceChat } from "@/components/shell/EvidenceChat";
import { SourceLink } from "@/components/shell/SourceLink";
import { TopNav } from "@/components/shell/TopNav";
import { Walkthrough } from "@/components/shell/Walkthrough";
import { hasAiCredentials } from "@/lib/ai/config";
import {
  artifactMetadata,
  formatArtifactDate,
  latestGeneratedAt,
} from "@/lib/data/artifact-metadata";
import {
  openGraphImage,
  siteDescription,
  siteName,
  siteUrl,
  twitterImage,
} from "@/lib/share-metadata";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: siteName,
  description: siteDescription,
  applicationName: siteName,
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: siteName,
    description: siteDescription,
    images: [openGraphImage],
    siteName,
    type: "website",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description: siteDescription,
    images: [twitterImage],
  },
  icons: {
    apple: [{ url: "/apple-icon" }],
    icon: [{ url: "/icon" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const artifactRows = artifactMetadata();
  const freshnessLabel = formatArtifactDate(latestGeneratedAt(artifactRows));
  const aiEnabled = hasAiCredentials();

  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} dark h-full antialiased`}
    >
      <body>
        <div className="app-shell">
          <TopNav freshnessLabel={freshnessLabel} />
          <Suspense fallback={null}>
            <Walkthrough />
          </Suspense>
          <EvidenceChat aiEnabled={aiEnabled} />
          <AdAnalystModal aiEnabled={aiEnabled} />
          {children}
          <footer className="app-footer">
            <div className="footer-summary">
              <span>
                data as of <strong>{freshnessLabel}</strong> ·{" "}
                <SourceLink href="/sources">sources</SourceLink>
              </span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
