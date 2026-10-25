import type { FxSnapshot } from "./fx";

export type CompetitorChangeItem = {
  date: string;
  direction: "down" | "flat" | "up";
  evidenceLink: string;
  provider: string;
  whatChanged: string;
};

function formatRate(value: number) {
  return value.toFixed(2);
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function changeDirection(delta: number): CompetitorChangeItem["direction"] {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

function quotedProviders(snapshot: FxSnapshot) {
  return snapshot.providers.filter(
    (provider) => provider.quotedRate !== null && provider.sourceUrl && provider.capturedAt,
  );
}

function uniqueSnapshotDays(snapshots: readonly FxSnapshot[]) {
  return [...new Set(snapshots.map((snapshot) => snapshot.capturedAt.slice(0, 10)))].sort();
}

function latestSnapshotByDay(snapshots: readonly FxSnapshot[]) {
  const byDay = new Map<string, FxSnapshot>();
  for (const snapshot of snapshots) {
    const day = snapshot.capturedAt.slice(0, 10);
    const current = byDay.get(day);
    if (!current || snapshot.capturedAt.localeCompare(current.capturedAt) > 0) {
      byDay.set(day, snapshot);
    }
  }

  return uniqueSnapshotDays(snapshots)
    .map((day) => byDay.get(day))
    .filter((snapshot): snapshot is FxSnapshot => Boolean(snapshot));
}

export function fxChangeStatusLabel(snapshots: readonly FxSnapshot[]) {
  const days = uniqueSnapshotDays(snapshots).length;
  return days < 7 ? `${days} days tracked, trend line unlocks at 7` : `${days} days tracked`;
}

export function buildFxChangeItems(snapshots: readonly FxSnapshot[]): CompetitorChangeItem[] {
  const sorted = latestSnapshotByDay(snapshots);
  const latest = sorted.at(-1);
  const previous = sorted.at(-2);

  if (!latest || !previous) return [];

  const previousByProvider = new Map(
    quotedProviders(previous).map((provider) => [provider.provider, provider]),
  );

  return quotedProviders(latest)
    .flatMap((provider): CompetitorChangeItem[] => {
      const before = previousByProvider.get(provider.provider);
      if (!before || before.quotedRate === null || provider.quotedRate === null) return [];

      const delta = provider.quotedRate - before.quotedRate;
      const direction = changeDirection(delta);
      return [
        {
          date: latest.capturedAt,
          direction,
          evidenceLink: provider.sourceUrl,
          provider: provider.provider,
          whatChanged: `${provider.provider} ${formatRate(before.quotedRate)} to ${formatRate(
            provider.quotedRate,
          )} since ${formatShortDate(previous.capturedAt)}`,
        },
      ];
    });
}
