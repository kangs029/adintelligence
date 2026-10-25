import {
  artifactMetadata,
  displayArtifactCadence,
  displayArtifactFile,
  formatArtifactDate,
  type ArtifactMeta,
} from "@/lib/data/artifact-metadata";
import { ProvenanceChip } from "./ProvenanceChip";

interface FreshnessTableProps {
  rows?: ArtifactMeta[];
  variant?: "footer" | "page";
}

export function FreshnessTable({
  rows = artifactMetadata(),
  variant = "page",
}: FreshnessTableProps) {
  return (
    <div className="freshness-table-wrap">
      <table className={`freshness-table freshness-table-${variant}`}>
        <thead>
          <tr>
            <th>Artifact</th>
            <th>Generated</th>
            <th>Cadence</th>
            <th>Provenance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.family}>
              <td>
                <strong>{row.family}</strong>
                <span>{displayArtifactFile(row.file)}</span>
              </td>
              <td>{formatArtifactDate(row.generatedAt)}</td>
              <td>{displayArtifactCadence(row.refreshCadence)}</td>
              <td>
                <ProvenanceChip provenance={row.provenance} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
