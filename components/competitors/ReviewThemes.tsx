import { ProvenanceChip } from "@/components/shell/ProvenanceChip";
import { buildAppPresenceSummaries, buildReviewGapInsights } from "@/lib/data/competitor-insights";
import { providerOrder } from "@/lib/data/fx";
import { providerColors } from "./provider-colors";

type ReviewExample = {
  date: string;
  id: string;
  rating: number;
  store: "ios" | "android";
  text: string;
  title: string | null;
};

type ThemeRow = {
  count: number;
  examples: ReviewExample[];
  sharePct: number;
  theme: string;
};

type ThemeGroup = {
  averageRating?: number | null;
  competitor: string;
  sampleSize: number;
  store: "ios" | "android";
  themes: ThemeRow[];
  window: { from: string | null; to: string | null };
};

type StoreBasis = {
  sampleSize: number;
  store: "ios" | "android";
};

export type ReviewThemesArtifact = {
  data: {
    groups: ThemeGroup[];
  };
  meta: {
    generatedAt: string;
  };
};

interface ReviewThemesProps {
  artifact: ReviewThemesArtifact;
}

function colorFor(competitor: string) {
  return providerColors[competitor as keyof typeof providerColors] ?? "var(--accent)";
}

function formatStore(store: "ios" | "android") {
  return store === "ios" ? "iOS" : "Android";
}

function plural(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}

function formatRating(value: number | null) {
  return value === null ? "Connector needed" : `${value.toFixed(1)} stars`;
}

function formatThemeShare(value: number) {
  return `${Math.round(value)}%`;
}

function formatReviewN(value: number) {
  return `n=${formatNumber(value)}`;
}

function formatVelocity(value: number | null) {
  return value === null ? "pending access" : `${value.toLocaleString("en-US")} / month`;
}

function formatWindow(window: { from: string | null; to: string | null }) {
  if (!window.from && !window.to) return "window unknown";
  return `${window.from ?? "unknown"} to ${window.to ?? "unknown"}`;
}

function formatStoreBasis(storeCounts: StoreBasis[]) {
  return storeCounts
    .map((row) => `${formatStore(row.store)} ${formatNumber(row.sampleSize)}`)
    .join(" + ");
}

function displayExamples(examples: ReviewExample[]) {
  return examples
    .filter((example) => example.rating <= 3)
    .sort((left, right) => left.rating - right.rating || right.date.localeCompare(left.date))
    .slice(0, 3);
}

function combinedGroups(groups: ThemeGroup[]) {
  const byCompetitor = new Map<string, ThemeGroup[]>();
  for (const group of groups) {
    if (!byCompetitor.has(group.competitor)) byCompetitor.set(group.competitor, []);
    byCompetitor.get(group.competitor)?.push(group);
  }

  return [...byCompetitor.entries()].map(([competitor, storeGroups]) => {
    const sampleSize = storeGroups.reduce((sum, group) => sum + group.sampleSize, 0);
    const themeNames = storeGroups[0]?.themes.map((theme) => theme.theme) ?? [];
    const themes = themeNames.map((themeName) => {
      const rows = storeGroups.flatMap((group) =>
        group.themes.filter((theme) => theme.theme === themeName),
      );
      const count = rows.reduce((sum, row) => sum + row.count, 0);
      const examples = displayExamples(rows.flatMap((row) => row.examples));
      return {
        count,
        examples,
        sharePct: sampleSize === 0 ? 0 : Math.round((count / sampleSize) * 1000) / 10,
        theme: themeName,
      };
    });
    const windows = storeGroups.flatMap((group) => [group.window.from, group.window.to]).filter(Boolean);

    return {
      competitor,
      sampleSize,
      storeCounts: storeGroups.map((group) => ({
        sampleSize: group.sampleSize,
        store: group.store,
      })),
      stores: storeGroups.map((group) => formatStore(group.store)),
      themes,
      window: {
        from: windows.sort()[0] ?? null,
        to: windows.sort().at(-1) ?? null,
      },
    };
  }).sort((left, right) => providerRank(left.competitor) - providerRank(right.competitor));
}

function providerRank(provider: string) {
  const index = providerOrder.indexOf(provider as (typeof providerOrder)[number]);
  return index === -1 ? providerOrder.length : index;
}

export function ReviewThemes({ artifact }: ReviewThemesProps) {
  const groups = combinedGroups(artifact.data.groups);
  const insights = buildReviewGapInsights(artifact);
  const appPresence = buildAppPresenceSummaries(artifact);
  const themeAnchors = [...new Set(groups.flatMap((group) => group.themes.map((theme) => theme.theme)))];

  return (
    <section className="evidence-section" aria-labelledby="review-themes-title">
      <div className="cardhead">
        <div>
          <h2 id="review-themes-title">Review themes</h2>
          <p className="section-subtitle">
            Keyword-topic counts from public iOS and Android reviews. Examples show non-positive
            reviews only.
          </p>
        </div>
        <ProvenanceChip date={artifact.meta.generatedAt.slice(0, 10)} provenance="snapshot" />
      </div>

      <div className="app-presence-card">
        <div>
          <h3>Review footprint</h3>
          <p>Captured public ratings, sample windows, and review recency by provider.</p>
        </div>
        <div className="app-presence-grid">
          {appPresence.map((summary) => (
            <article key={summary.provider}>
              <span className="provider-cell-inner">
                <span
                  aria-hidden="true"
                  className="provider-dot"
                  style={{ background: colorFor(summary.provider) }}
                />
                {summary.provider}
              </span>
              <strong>{formatRating(summary.averageRating)}</strong>
              <span>
                {formatNumber(summary.reviewCount)} reviews, {summary.countLabel} sample
              </span>
              <span>{formatVelocity(summary.reviewsPerMonth)}</span>
              <span>{formatWindow(summary.window)}</span>
            </article>
          ))}
        </div>
      </div>

      <div className="review-gap-block">
        <div className="mini-section-heading">
          <h3>Largest topic deltas</h3>
          <p>
            Largest keyword-topic share differences among providers with at least 100 captured
            public reviews.
          </p>
        </div>
        <div className="review-gap-grid">
          {insights.gaps.map((gap) => (
            <article className="review-gap-card" key={`${gap.theme}-${gap.weakestProvider}`}>
              <div className="ad-meta-row">
                <strong>{gap.theme}</strong>
                <a href={gap.anchor}>Non-positive excerpts</a>
              </div>
              <dl>
                <div>
                  <dt>Highest mention rate</dt>
                  <dd>
                    {gap.weakestProvider} · {formatThemeShare(gap.weakestSharePct)} ·{" "}
                    {formatReviewN(gap.weakestSampleSize)}
                  </dd>
                </div>
                <div>
                  <dt>Lowest mention rate</dt>
                  <dd>
                    {gap.strongestProvider} · {formatThemeShare(gap.strongestSharePct)} ·{" "}
                    {formatReviewN(gap.strongestSampleSize)}
                  </dd>
                </div>
              </dl>
              <p>{gap.sentence}</p>
            </article>
          ))}
          {insights.xpatSignal ? (
            <article className="review-gap-card xpat-signal-card">
              <div className="ad-meta-row">
                <strong>Xpat own topic signal</strong>
                <span className="small-sample-chip">small sample</span>
              </div>
              <p>{insights.xpatSignal.sentence}</p>
            </article>
          ) : null}
        </div>
      </div>

      <div className="review-anchor-index" aria-hidden="true">
        {themeAnchors.map((theme) => (
          <span
            id={`review-theme-${theme.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "")}`}
            key={theme}
          />
        ))}
      </div>

      <div className="review-theme-grid">
        {groups.map((group) => (
          <article className="review-theme-card" key={group.competitor}>
            <div className="ad-meta-row">
              <span className="provider-cell">
                <span
                  className="provider-dot"
                  style={{ background: colorFor(group.competitor) }}
                  aria-hidden="true"
                />
                {group.competitor}
              </span>
              <span className="review-store-list">{group.stores.join(" + ")}</span>
            </div>
            <p className="review-window">
              {plural(group.sampleSize, "review")} · Basis: {formatStoreBasis(group.storeCounts)}
              ; {group.competitor === "Xpat" ? "lifetime sample" : "captured window"}{" "}
              {formatWindow(group.window)}
            </p>
            <div className="theme-bars">
              {group.themes.map((theme) => (
                <div className="theme-bar-row" key={theme.theme}>
                  <div className="theme-bar-label">
                    <span>{theme.theme}</span>
                    <strong>
                      {formatThemeShare(theme.sharePct)} · {formatReviewN(group.sampleSize)}
                    </strong>
                  </div>
                  <div className="theme-bar-track">
                    <span
                      className="theme-bar-fill"
                      style={{
                        background: colorFor(group.competitor),
                        width: `${Math.min(100, theme.sharePct)}%`,
                      }}
                    />
                  </div>
                  {theme.examples.length > 0 ? (
                    <details className="review-examples">
                      <summary>{plural(theme.examples.length, "non-positive excerpt")}</summary>
                      <ul>
                        {theme.examples.map((example) => (
                          <li key={`${theme.theme}-${example.id}`}>
                            <span>
                              {formatStore(example.store)} · {example.rating}/5 ·{" "}
                              {example.date.slice(0, 10)}
                            </span>
                            <p>{example.text}</p>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
