import type { PlaybookChannel } from "./dossier";

export type ReviewThemeGroup = {
  competitor: string;
  sampleSize: number;
  store: string;
  themes: Array<{
    count: number;
    sharePct: number;
    theme: string;
  }>;
  window?: {
    from: string | null;
    to: string | null;
  };
};

export type CounterMoveExperiment = {
  channelName: string;
  competitor: string;
  hypothesis: string;
  killCriterion: string;
  observedWeakness: string;
  sourceLinks: Array<{ href: string; label: string }>;
  successThreshold: string;
  tag: "counter-move";
};

function pickTheme(groups: ReviewThemeGroup[]) {
  return groups
    .filter((group) => group.sampleSize > 0 && group.competitor !== "Xpat")
    .flatMap((group) =>
      group.themes
        .filter((theme) => theme.count > 0 && theme.sharePct > 0)
        .map((theme) => ({ group, theme })),
    )
    .sort((left, right) => {
      const shareDelta = right.theme.sharePct - left.theme.sharePct;
      if (shareDelta) return shareDelta;
      return right.theme.count - left.theme.count;
    })[0];
}

function channelForTheme(theme: string, channels: PlaybookChannel[]) {
  if (/rate|fee|speed/iu.test(theme)) {
    return channels.find((channel) => channel.id === "google-search") ?? channels[0];
  }

  if (/app|support|trust|kyc/iu.test(theme)) {
    return channels.find((channel) => channel.id === "meta") ?? channels[0];
  }

  return channels[0];
}

export function buildCounterMoveExperiment({
  channels,
  reviewThemes,
}: {
  channels: PlaybookChannel[];
  reviewThemes: ReviewThemeGroup[];
}): CounterMoveExperiment | null {
  const selected = pickTheme(reviewThemes);
  if (!selected || channels.length === 0) return null;

  const channel = channelForTheme(selected.theme.theme, channels);
  const observed = `${selected.group.competitor} ${selected.group.store} reviews mention ${selected.theme.theme.toLowerCase()} at ${selected.theme.sharePct.toFixed(1)}% of the sampled public reviews.`;

  return {
    channelName: channel.name,
    competitor: selected.group.competitor,
    hypothesis: `Xpat counter-message hypothesis: ${selected.theme.theme.toLowerCase()} clarity earns observable comparison engagement in this market.`,
    killCriterion: "Pause after 14 days below the agreed stop line; keep the observed review theme as learning.",
    observedWeakness: observed,
    sourceLinks: [
      {
        href: "/competitors#review-themes-title",
        label: `${selected.group.competitor} review themes`,
      },
    ],
    successThreshold: `Threshold set with Xpat at kickoff: define the numeric continue, change, and stop lines for ${channel.successMetric.toLowerCase()}.`,
    tag: "counter-move",
  };
}
