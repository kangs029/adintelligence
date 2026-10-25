import type { Metadata } from "next";

export const siteUrl = "https://xpat-os.vercel.app";
export const siteName = "XPAT OS";
export const siteDescription =
  "Evidence-led audience intelligence for Xpat's US to India growth planning.";
export const openGraphImage = {
  alt: "XPAT OS audience intelligence preview",
  height: 630,
  url: "/og/xpat-os.png",
  width: 1200,
};
export const twitterImage = openGraphImage;

export function pageMetadata({
  description,
  path,
  title,
}: {
  description: string;
  path: string;
  title: string;
}): Metadata {
  const url = `${siteUrl}${path}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      images: [openGraphImage],
      siteName,
      type: "website",
      url,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [twitterImage],
    },
  };
}
