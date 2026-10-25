import type { Market } from "@/lib/data/markets";
import type { ReviewThemeGroup } from "./counter-moves";
import type { TargetZone } from "./target-zones";

export type ContentTopic = {
  boundary: string;
  copyReadyAsset: string;
  id: string;
  nextExperiment: string;
  ownerChannel: string;
  replyAngle: string;
  sourceEvidence: string;
  sourceLinks: Array<{ href: string; label: string }>;
  topic: string;
};

type TopicChannel = {
  evidenceLinks?: Array<{ href: string; label: string }>;
  id: string;
  name: string;
  successMetric: string;
};

type TopicPersona = {
  name: string;
  score: number;
};

type CommunityThread = {
  action?: string;
  pain?: string;
  priority?: string;
  responseAngle?: string;
  themes?: string[];
  title: string;
  url: string;
};

type MonitorQueue = {
  link: string;
  platform?: string;
  priority?: string;
  responseAngle?: string;
  title: string;
};

type SponsorExample = {
  brand: string;
  capturedAt: string;
  creator: string;
  sourceUrl: string;
};

function shortMarketName(name: string) {
  return name.split("-")[0].split(",")[0].trim();
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function priorityRank(value: string | undefined) {
  if (value === "high") return 0;
  if (value === "medium") return 1;
  return 2;
}

function actionRank(value: string | undefined) {
  if (value === "reply") return 0;
  if (value === "monitor") return 1;
  return 2;
}

function channelById(channels: TopicChannel[], ids: string[]) {
  return channels.find((channel) => ids.includes(channel.id)) ?? channels[0] ?? null;
}

function bestCommunityThread(threads: CommunityThread[], monitorQueues: MonitorQueue[]) {
  const thread = threads
    .filter((candidate) => candidate.responseAngle || candidate.pain)
    .toSorted((left, right) => {
      const actionOrder = actionRank(left.action) - actionRank(right.action);
      if (actionOrder) return actionOrder;
      return priorityRank(left.priority) - priorityRank(right.priority);
    })[0];

  if (thread) return thread;

  const queue = monitorQueues
    .filter((candidate) => candidate.responseAngle)
    .toSorted((left, right) => priorityRank(left.priority) - priorityRank(right.priority))[0];

  return queue
    ? {
        responseAngle: queue.responseAngle,
        title: queue.title,
        url: queue.link,
      }
    : null;
}

function topReviewTheme(groups: ReviewThemeGroup[]) {
  return groups
    .filter((group) => group.competitor !== "Xpat" && group.sampleSize > 0)
    .flatMap((group) =>
      group.themes
        .filter((theme) => theme.count > 0 && theme.sharePct > 0)
        .map((theme) => ({ group, theme })),
    )
    .toSorted((left, right) => right.theme.sharePct - left.theme.sharePct || right.theme.count - left.theme.count)[0];
}

function topicKey(topic: ContentTopic) {
  return `${topic.topic}|${topic.ownerChannel}`;
}

export function buildContentTopics({
  channels,
  communityThreads,
  market,
  monitorQueues = [],
  personas,
  reviewThemes,
  sponsorExamples,
  targetZones,
}: {
  channels: TopicChannel[];
  communityThreads: CommunityThread[];
  market: Market;
  monitorQueues?: MonitorQueue[];
  personas: TopicPersona[];
  reviewThemes: ReviewThemeGroup[];
  sponsorExamples: SponsorExample[];
  targetZones: TargetZone[];
}): ContentTopic[] {
  const topics: ContentTopic[] = [];
  const marketLabel = shortMarketName(market.name);
  const topPersona = personas[0]?.name ?? "selected persona";
  const searchChannel = channelById(channels, ["google-search"]);
  const metaChannel = channelById(channels, ["meta"]);
  const creatorChannel = channelById(channels, ["creator-sponsorship", "youtube-creators"]);
  const communityThread = bestCommunityThread(communityThreads, monitorQueues);
  const reviewTheme = topReviewTheme(reviewThemes);
  const topZone = targetZones[0];

  if (communityThread && searchChannel) {
    topics.push({
      boundary: "Community threads are language evidence only. Use source-tagged content tests before drawing outcomes.",
      copyReadyAsset:
        "Comparison checklist: rate, fee, timing expectation, verification steps, and support path before sending money to India.",
      id: `thread-${slug(communityThread.title)}`,
      nextExperiment: `Run the checklist through ${searchChannel.name}; metric: ${searchChannel.successMetric}`,
      ownerChannel: searchChannel.name,
      replyAngle:
        communityThread.responseAngle ??
        "Turn the thread pain into a comparison checklist with clear source links and no direct outreach.",
      sourceEvidence: communityThread.title,
      sourceLinks: [{ href: communityThread.url, label: "community thread" }],
      topic: `${marketLabel} comparison checklist`,
    });
  }

  if (reviewTheme) {
    const reviewChannel = /app|support|trust|kyc/iu.test(reviewTheme.theme.theme)
      ? metaChannel
      : searchChannel;
    if (reviewChannel) {
      topics.push({
        boundary: "Review shares are public frequency observations, not competitor performance proof.",
        copyReadyAsset:
          "Reply angle: compare status clarity, support path, and quote transparency before choosing a transfer app.",
        id: `review-${slug(reviewTheme.group.competitor)}-${slug(reviewTheme.theme.theme)}`,
        nextExperiment: `Use the counter-message in ${reviewChannel.name}; metric: ${reviewChannel.successMetric}`,
        ownerChannel: reviewChannel.name,
        replyAngle:
          "Answer the observed pain with factual comparison copy and approved Xpat product proof, not competitor outcome claims.",
        sourceEvidence: `${reviewTheme.group.competitor} ${reviewTheme.group.store} reviews mention ${reviewTheme.theme.theme.toLowerCase()} at ${reviewTheme.theme.sharePct.toFixed(1)}% of sampled public reviews.`,
        sourceLinks: [{ href: "/competitors#review-themes-title", label: "review themes" }],
        topic: `${reviewTheme.theme.theme} clarity angle`,
      });
    }
  }

  if (topZone && metaChannel) {
    topics.push({
      boundary: "Community places are presence evidence only. They do not prove customers or ad outcomes.",
      copyReadyAsset:
        "Local QR card: compare the quote, know the support path, and use one source tag for the surface.",
      id: `zone-${topZone.id}`,
      nextExperiment: `Test the card in the top zone through ${metaChannel.name}; metric: ${metaChannel.successMetric}`,
      ownerChannel: metaChannel.name,
      replyAngle: `Use ${topZone.locality} as the local setup context for ${topPersona}, while keeping the copy educational.`,
      sourceEvidence: `${topZone.locality} has ${topZone.anchorCount} audited community places in this dossier zone list.`,
      sourceLinks: topZone.evidenceLinks.slice(0, 2),
      topic: `${topZone.locality} community setup card`,
    });
  }

  if (sponsorExamples[0] && creatorChannel) {
    const example = sponsorExamples[0];
    topics.push({
      boundary: "Observed sponsor content proves a channel surface exists. It does not prove campaign results.",
      copyReadyAsset:
        "Creator brief: compare the quote, explain verification expectations, show the support path, and disclose the source tag.",
      id: `creator-${slug(example.brand)}-${slug(example.creator)}`,
      nextExperiment: `Run as ${creatorChannel.name}; metric: ${creatorChannel.successMetric}`,
      ownerChannel: creatorChannel.name,
      replyAngle:
        "Start with the comparison problem, show source-linked proof, and close with an Xpat-issued code only when available.",
      sourceEvidence: `${example.brand} sponsor example observed with ${example.creator}, captured ${example.capturedAt}.`,
      sourceLinks: [{ href: example.sourceUrl, label: `${example.brand} sponsor example` }],
      topic: "Creator explainer for US-based Indians",
    });
  }

  return [...new Map(topics.map((topic) => [topicKey(topic), topic])).values()].slice(0, 4);
}
