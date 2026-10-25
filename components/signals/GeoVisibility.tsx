import { Bot, Camera, ClipboardList } from "lucide-react";
import { ProvenanceChip } from "@/components/shell/ProvenanceChip";
import { PlaybookHandoffLink } from "./PlaybookHandoffLink";

type GeoVisibilityCell =
  | {
      assistant: string;
      capturedAt: string;
      evidenceScreenshotPath: string;
      method: "manual capture";
      providersNamed: string[];
      query: string;
      status: "captured";
      xpatMentioned: boolean;
    }
  | {
      assistant: string;
      capturedAt: null;
      evidenceScreenshotPath: null;
      method: "manual capture";
      pendingReason: string;
      providersNamed: [];
      query: string;
      status: "capture-pending";
      xpatMentioned: false;
    };

export type GeoVisibilityArtifact = {
  data: {
    assistants: string[];
    capturedAnswers: number;
    cells: GeoVisibilityCell[];
    competitorsAppearing: string[];
    queries: string[];
    status: "partial";
    totalCells: number;
    xpatMentions: number;
  };
  meta: {
    generatedAt: string;
  };
};

interface GeoVisibilityProps {
  artifact: GeoVisibilityArtifact;
}

function formatDate(value: string) {
  return value.slice(0, 10);
}

function cellFor(artifact: GeoVisibilityArtifact, query: string, assistant: string) {
  return artifact.data.cells.find((cell) => cell.query === query && cell.assistant === assistant);
}

function Cell({ cell }: { cell: GeoVisibilityCell | undefined }) {
  if (!cell || cell.status === "capture-pending") {
    return (
      <div className="geo-cell geo-cell-pending">
        <span>capture pending</span>
      </div>
    );
  }

  return (
    <div className={cell.xpatMentioned ? "geo-cell geo-cell-present" : "geo-cell"}>
      <span>{cell.xpatMentioned ? "Xpat named" : "Xpat not named"}</span>
      <div className="geo-provider-list">
        {cell.providersNamed.length > 0 ? (
          cell.providersNamed.map((provider) => <span key={provider}>{provider}</span>)
        ) : (
          <span>no providers recorded</span>
        )}
      </div>
      <small>{formatDate(cell.capturedAt)}</small>
    </div>
  );
}

export function GeoVisibility({ artifact }: GeoVisibilityProps) {
  const allPending = artifact.data.capturedAnswers === 0;
  const summary = allPending
    ? `No assistant answers have been captured yet. ${artifact.data.queries.length.toLocaleString("en-US")} queries across ${artifact.data.assistants.length.toLocaleString("en-US")} assistants are queued for manual capture.`
    : `Xpat is named in ${artifact.data.xpatMentions.toLocaleString("en-US")} of ${artifact.data.capturedAnswers.toLocaleString("en-US")} captured answers. Competitors appear in ${artifact.data.competitorsAppearing.length.toLocaleString("en-US")}.`;

  return (
    <section className="evidence-section" aria-labelledby="geo-visibility-title">
      <div className="cardhead">
        <div>
          <h2 id="geo-visibility-title">AI answer visibility</h2>
          <p className="section-subtitle">
            AI assistants are a growing discovery surface for corridor queries. This grid is a dated visibility benchmark, re-run monthly.
          </p>
        </div>
        <ProvenanceChip date={formatDate(artifact.meta.generatedAt)} provenance="snapshot" />
      </div>

      <div className="geo-summary-card">
        <div>
          <Bot size={16} aria-hidden="true" />
          <p>{summary}</p>
        </div>
        <PlaybookHandoffLink anchor="content-seo" className="action-link">
          Route into content play
        </PlaybookHandoffLink>
      </div>

      {allPending ? (
        <div className="geo-pending-panel">
          <div>
            <ClipboardList size={16} aria-hidden="true" />
            <div>
              <h3>Capture pending for the full benchmark</h3>
              <p>
                Pending cells mean no answer screenshot was captured. They do not
                mean Xpat or any competitor was absent.
              </p>
            </div>
          </div>
          <ul>
            {artifact.data.queries.map((query) => (
              <li key={query}>{query}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="geo-grid-wrap">
          <table className="geo-grid">
            <thead>
              <tr>
                <th>Query</th>
                {artifact.data.assistants.map((assistant) => (
                  <th key={assistant}>{assistant}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {artifact.data.queries.map((query) => (
                <tr key={query}>
                  <th scope="row">{query}</th>
                  {artifact.data.assistants.map((assistant) => (
                    <td key={`${query}-${assistant}`}>
                      <Cell cell={cellFor(artifact, query, assistant)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="inline-connector-strip">
        <Camera size={14} aria-hidden="true" />
        <span>Manual capture requires a fresh session, screenshot, and recorded provider names for each answer.</span>
      </div>
    </section>
  );
}
