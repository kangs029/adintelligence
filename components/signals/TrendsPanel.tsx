import { Plug } from "lucide-react";
import { ProvenanceChip } from "@/components/shell/ProvenanceChip";
import { SourceLink } from "@/components/shell/SourceLink";

export function TrendsPanel() {
  return (
    <section className="evidence-section" aria-labelledby="trends-title">
      <div className="cardhead">
        <div>
          <h2 id="trends-title">Search demand</h2>
          <p className="section-subtitle">
            Search-interest panel stays empty until an authorized API or dated CSV
            export is loaded.
          </p>
        </div>
        <ProvenanceChip provenance="connector-needed" />
      </div>

      <div className="connector-state signal-connector">
        <div className="connector-title">
          <Plug size={16} aria-hidden="true" />
          <h3>Google Trends API is alpha-limited</h3>
        </div>
        <p>
          Use the Google Trends CSV export path until API access is approved. The
          manual upload must preserve query, geography, time bucket, interest
          value, source URL, and capturedAt.
        </p>
        <code className="schema-box">{`data/artifacts/trends-manual-upload.json
{
  "query": "send money to india",
  "geo": "US",
  "timeBucket": "YYYY-MM-DD",
  "interest": 0,
  "sourceUrl": "https://trends.google.com/...",
  "capturedAt": "YYYY-MM-DDT00:00:00.000Z"
}`}</code>
        <div className="trend-source-row">
          <SourceLink href="https://developers.google.com/search/apis/trends">
            Google Trends API alpha
          </SourceLink>
          <SourceLink href="https://support.google.com/trends/answer/4365538?hl=en">
            CSV export help
          </SourceLink>
        </div>
      </div>
    </section>
  );
}
