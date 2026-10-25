import { ProvenanceChip } from "@/components/shell/ProvenanceChip";
import { PlaybookHandoffLink } from "./PlaybookHandoffLink";

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
  theme: string;
};

type ThemeGroup = {
  competitor: string;
  sampleSize: number;
  store: "ios" | "android";
  themes: ThemeRow[];
};

export type ReviewPainRollupArtifact = {
  data: {
    groups: ThemeGroup[];
  };
  meta: {
    generatedAt: string;
  };
};

interface ReviewPainRollupProps {
  artifact: ReviewPainRollupArtifact;
}

function formatDate(value: string) {
  return value.slice(0, 10);
}

function rollupThemes(groups: ThemeGroup[]) {
  const corpusSize = totalReviews(groups);
  const totals = new Map<
    string,
    { count: number; examples: ReviewExample[] }
  >();

  for (const group of groups) {
    for (const theme of group.themes) {
      const existing = totals.get(theme.theme) ?? {
        count: 0,
        examples: [],
      };
      existing.count += theme.count;
      existing.examples.push(...theme.examples);
      totals.set(theme.theme, existing);
    }
  }

  return [...totals.entries()]
    .map(([theme, row]) => ({
      count: row.count,
      examples: row.examples.slice(0, 3),
      sharePct: corpusSize === 0 ? 0 : Math.round((row.count / corpusSize) * 100),
      theme,
    }))
    .sort((left, right) => right.sharePct - left.sharePct || left.theme.localeCompare(right.theme));
}

function totalReviews(groups: ThemeGroup[]) {
  return groups.reduce((sum, group) => sum + group.sampleSize, 0);
}

export function ReviewPainRollup({ artifact }: ReviewPainRollupProps) {
  const rows = rollupThemes(artifact.data.groups);
  const maxShare = Math.max(1, ...rows.map((row) => row.sharePct));

  return (
    <section className="evidence-section" aria-labelledby="review-pain-rollup-title">
      <div className="cardhead">
        <div>
          <h2 id="review-pain-rollup-title">Category review pain</h2>
          <p className="section-subtitle">
            Cross-competitor theme shares from {totalReviews(artifact.data.groups).toLocaleString("en-US")} public review excerpts.
          </p>
        </div>
        <ProvenanceChip date={formatDate(artifact.meta.generatedAt)} provenance="derived" />
      </div>

      <div className="review-pain-grid">
        {rows.map((row) => (
          <article className="review-pain-row" key={row.theme}>
            <div className="theme-bar-label">
              <span>{row.theme}</span>
              <strong className="review-pain-percent">
                {row.sharePct}%
                <span>n={row.count.toLocaleString("en-US")}</span>
              </strong>
            </div>
            <div className="review-pain-bar-track">
              <span
                className="review-pain-fill"
                style={{ width: `${Math.max(2, (row.sharePct / maxShare) * 100)}%` }}
              />
            </div>
            {row.examples.length > 0 ? (
              <details className="review-examples">
                <summary>{row.examples.length} excerpts</summary>
                <ul>
                  {row.examples.map((example) => (
                    <li key={`${row.theme}-${example.id}`}>
                      <span>
                        {example.store === "ios" ? "iOS" : "Android"} · {example.rating}/5 ·{" "}
                        {formatDate(example.date)}
                      </span>
                      <p>{example.text}</p>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <PlaybookHandoffLink anchor="messaging" className="action-link">
              Use as messaging angle
            </PlaybookHandoffLink>
          </article>
        ))}
      </div>
    </section>
  );
}
