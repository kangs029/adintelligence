import { FreshnessTable } from "@/components/shell/FreshnessTable";
import { PageHeader } from "@/components/shell/PageHeader";
import { ProvenanceChip } from "@/components/shell/ProvenanceChip";
import {
  artifactMetadata,
  displayArtifactCadence,
  displayArtifactFile,
  displayArtifactMethod,
  displayArtifactSource,
  formatArtifactDate,
} from "@/lib/data/artifact-metadata";
import { pageMetadata } from "@/lib/share-metadata";

export const metadata = pageMetadata({
  title: "Sources · XPAT OS",
  description:
    "Artifact freshness, provenance, source caveats, and methodology behind XPAT OS evidence.",
  path: "/sources",
});

function sourceAnchorId(family: string) {
  return `source-${family}`;
}

function methodologyNote(family: string) {
  if (family === "fx-snapshots") {
    return "Wise quotes are fetched server-side with the documented unauthenticated POST quote request. The Competitors table links here instead of the raw endpoint because that endpoint is not a browser GET page.";
  }

  return null;
}

export default function SourcesPage() {
  const rows = artifactMetadata();

  return (
    <main className="page-wrap sources-page">
      <PageHeader
        title="Sources"
        description="The data families, refresh cadence, caveats, and methodology behind the demo."
        stats={[
          {
            label: "Artifact families",
            value: rows.length.toLocaleString("en-US"),
            detail: "including the map projection",
          },
          {
            label: "Connector-needed rows",
            value: rows
              .filter((row) => row.provenance === "connector-needed")
              .length.toLocaleString("en-US"),
            detail: "rendered as missing access, not invented data",
          },
          {
            label: "Latest generated",
            value: formatArtifactDate(rows.map((row) => row.generatedAt).sort().at(-1)),
            detail: "UTC artifact timestamp",
            valueTone: "status",
          },
        ]}
      />

      <section className="evidence-section" aria-labelledby="freshness-title">
        <div className="cardhead">
          <div>
            <h2 id="freshness-title">Freshness table</h2>
            <p className="section-subtitle">
              The footer uses this same metadata model.
            </p>
          </div>
          <ProvenanceChip provenance="derived" />
        </div>
        <FreshnessTable rows={rows} />
      </section>

      <section className="sources-grid" aria-label="Artifact methodology">
        {rows.map((row) => (
          <article className="source-method-card" id={sourceAnchorId(row.family)} key={row.family}>
            <div className="cardhead">
              <div>
                <h2>{row.family}</h2>
                <p>{displayArtifactFile(row.file)}</p>
              </div>
              <ProvenanceChip provenance={row.provenance} />
            </div>
            <dl>
              <div>
                <dt>Generated</dt>
                <dd>{formatArtifactDate(row.generatedAt)}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{displayArtifactSource(row.source)}</dd>
              </div>
              <div>
                <dt>Method</dt>
                <dd>{displayArtifactMethod(row.method)}</dd>
              </div>
              <div>
                <dt>Cadence</dt>
                <dd>{displayArtifactCadence(row.refreshCadence)}</dd>
              </div>
            </dl>
            <ul className="caveat-list">
              {row.caveats.map((caveat, i) => (
                <li key={i}>{caveat}</li>
              ))}
            </ul>
            {methodologyNote(row.family) ? <p>{methodologyNote(row.family)}</p> : null}
          </article>
        ))}
      </section>
    </main>
  );
}
