import { Camera, Database, FunctionSquare, Plug, Sparkles } from "lucide-react";

export type Provenance =
  | "live"
  | "snapshot"
  | "grounded"
  | "derived"
  | "generated"
  | "connector-needed";

interface ProvenanceChipProps {
  provenance: Provenance;
  date?: string;
  release?: string;
  model?: string;
}

const labels: Record<Provenance, string> = {
  live: "LIVE",
  snapshot: "SNAPSHOT",
  grounded: "GROUNDED",
  derived: "DERIVED",
  generated: "GENERATED",
  "connector-needed": "CONNECTOR NEEDED",
};

export function ProvenanceChip({
  provenance,
  date,
  release,
  model,
}: ProvenanceChipProps) {
  const label =
    provenance === "snapshot" && date
      ? `${labels[provenance]} · ${date}`
      : provenance === "grounded" && release
        ? `${labels[provenance]} · ${release}`
        : provenance === "generated" && model
          ? `${labels[provenance]} · ${model}`
          : labels[provenance];

  return (
    <span className={`provenance-chip chip-${provenance}`}>
      <ChipIcon provenance={provenance} />
      {label}
    </span>
  );
}

function ChipIcon({ provenance }: { provenance: Provenance }) {
  if (provenance === "live") {
    return <span className="live-dot" aria-hidden="true" />;
  }

  const size = 12;
  if (provenance === "snapshot") return <Camera size={size} aria-hidden="true" />;
  if (provenance === "grounded") return <Database size={size} aria-hidden="true" />;
  if (provenance === "derived") {
    return <FunctionSquare size={size} aria-hidden="true" />;
  }
  if (provenance === "generated") {
    return <Sparkles size={size} aria-hidden="true" />;
  }

  return <Plug size={size} aria-hidden="true" />;
}
