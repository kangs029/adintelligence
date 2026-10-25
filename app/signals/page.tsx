import {
  CommunityThreads,
  type CommunityThreadsArtifact,
} from "@/components/signals/CommunityThreads";
import {
  CommunitySentiment,
  type CommunitySentimentArtifact,
} from "@/components/signals/CommunitySentiment";
import { ContentTopics } from "@/components/signals/ContentTopics";
import { CreatorGrid, type CreatorsArtifact } from "@/components/signals/CreatorGrid";
import {
  GeoVisibility,
  type GeoVisibilityArtifact,
} from "@/components/signals/GeoVisibility";
import {
  ReviewPainRollup,
  type ReviewPainRollupArtifact,
} from "@/components/signals/ReviewPainRollup";
import { PlaybookHandoffProvider } from "@/components/signals/PlaybookHandoffLink";
import {
  SwitchMoments,
  type SwitchMomentsArtifact,
} from "@/components/signals/SwitchMoments";
import { TrendsPanel } from "@/components/signals/TrendsPanel";
import {
  XpatFootprintCard,
  type XpatFootprintArtifact,
} from "@/components/signals/XpatFootprintCard";
import { PageHeader } from "@/components/shell/PageHeader";
import communityThreadsArtifact from "@/data/artifacts/community-threads.json";
import communitySentimentArtifact from "@/data/artifacts/community-sentiment-contexts.json";
import creatorsArtifact from "@/data/artifacts/creators.json";
import geoVisibilityArtifact from "@/data/artifacts/geo-visibility.json";
import marketsArtifact from "@/data/artifacts/markets.json";
import reviewThemesArtifact from "@/data/artifacts/review-themes.json";
import switchMomentsArtifact from "@/data/artifacts/switch-moments.json";
import xpatFootprintArtifact from "@/data/artifacts/xpat-footprint.json";
import { isPlaybookMarketGeoid } from "@/lib/playbook/handoff";
import { pageMetadata } from "@/lib/share-metadata";

export const metadata = pageMetadata({
  title: "Signals · XPAT OS",
  description:
    "Dated community threads, creator evidence, review pain, and AI-answer visibility for Xpat audience planning.",
  path: "/signals",
});

function reviewExcerptsMined(artifact: ReviewPainRollupArtifact) {
  return artifact.data.groups.reduce((sum, group) => sum + group.sampleSize, 0);
}

function creatorCount(artifact: CreatorsArtifact) {
  return artifact.data.creators.length;
}

function evidenceLinkedCreatorCount(artifact: CreatorsArtifact) {
  return artifact.data.evidenceLinkedCount ?? artifact.data.creators.filter(
    (creator) => "group" in creator && creator.group === "evidence-linked",
  ).length;
}

function monthYear(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}

function geoVisibilityKpi(artifact: GeoVisibilityArtifact) {
  if (artifact.data.capturedAnswers === 0) {
    return {
      detail: `${artifact.data.totalCells.toLocaleString("en-US")} answer cells queued for manual capture`,
      value: "Capture pending",
    };
  }

  return {
    detail: "manual capture grid, pending cells stay blank",
    value: `${artifact.data.capturedAnswers.toLocaleString("en-US")} of ${artifact.data.totalCells.toLocaleString("en-US")}`,
  };
}

type HandoffMarket = {
  geoid: string;
  name: string;
  score?: number | null;
  tier?: number | null;
};

function topTierOneMarketGeoid(markets: HandoffMarket[]) {
  const market = markets
    .filter((candidate) => candidate.tier === 1 && isPlaybookMarketGeoid(candidate.geoid))
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || left.name.localeCompare(right.name))[0];

  return market?.geoid ?? "31000US45940";
}

export default function SignalsPage() {
  const threads = communityThreadsArtifact as CommunityThreadsArtifact;
  const sentiment = communitySentimentArtifact as unknown as CommunitySentimentArtifact;
  const creators = creatorsArtifact as CreatorsArtifact;
  const geoVisibility = geoVisibilityArtifact as unknown as GeoVisibilityArtifact;
  const reviewThemes = reviewThemesArtifact as ReviewPainRollupArtifact;
  const switchMoments = switchMomentsArtifact as SwitchMomentsArtifact;
  const xpatFootprint = xpatFootprintArtifact as XpatFootprintArtifact;
  const defaultPlaybookMarketGeoid = topTierOneMarketGeoid(marketsArtifact.data.markets);
  const reviewCount = reviewExcerptsMined(reviewThemes);
  const creatorsFound = creatorCount(creators);
  const linkedCreators = evidenceLinkedCreatorCount(creators);
  const threadCaptureMonth = monthYear(threads.meta.generatedAt);
  const creatorCaptureMonth = monthYear(creators.meta.generatedAt);
  const geoKpi = geoVisibilityKpi(geoVisibility);

  return (
    <main className="page-wrap signals-page">
      <PageHeader
        title="Signals"
        description="What the community is saying, dated honestly, and the creators whose audience overlaps."
        stats={[
          {
            label: "Review excerpts mined",
            value: reviewCount.toLocaleString("en-US"),
            detail: `iOS and Android public reviews, ${monthYear(reviewThemes.meta.generatedAt)}`,
          },
          {
            label: "Community threads",
            value: (threads.data.recentCount + threads.data.historicalCount).toLocaleString("en-US"),
            detail: `captured ${threadCaptureMonth}, API refresh pending`,
          },
          {
            label: "Creators identified",
            value: creatorsFound.toLocaleString("en-US"),
            detail: `${linkedCreators.toLocaleString("en-US")} evidence-linked, latest ${creatorCaptureMonth}`,
          },
          {
            label: "AI answers captured",
            value: geoKpi.value,
            detail: geoKpi.detail,
            valueTone: "status",
          },
        ]}
      />

      <PlaybookHandoffProvider defaultMarketGeoid={defaultPlaybookMarketGeoid}>
        <ContentTopics
          creators={creators}
          geoVisibility={geoVisibility}
          reviewThemes={reviewThemes}
          switchMoments={switchMoments}
          threads={threads}
        />
        <CommunityThreads artifact={threads} />
        <CommunitySentiment artifact={sentiment} threads={threads.data.threads} />
        <SwitchMoments artifact={switchMoments} />
        <CreatorGrid artifact={creators} />
        <GeoVisibility artifact={geoVisibility} />
        <ReviewPainRollup artifact={reviewThemes} />
        <XpatFootprintCard artifact={xpatFootprint} />
        <TrendsPanel />
      </PlaybookHandoffProvider>
    </main>
  );
}
