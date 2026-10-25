import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  artifactMetadata,
  displayArtifactCadence,
  displayArtifactFile,
} from "@/lib/data/artifact-metadata";
import { FreshnessTable } from "./FreshnessTable";

describe("FreshnessTable", () => {
  it("renders one row per artifact metadata family", () => {
    const rows = artifactMetadata();
    const html = renderToStaticMarkup(<FreshnessTable rows={rows} />);

    for (const row of rows) {
      expect(html).toContain(row.family);
      expect(html).toContain(displayArtifactFile(row.file));
      expect(html).toContain(displayArtifactCadence(row.refreshCadence));
    }
    expect(html).not.toContain("manual v1 port");
    expect(html).not.toContain("daily or before demos");
  });

  it("shows provenance chips in footer mode", () => {
    const html = renderToStaticMarkup(<FreshnessTable rows={artifactMetadata()} variant="footer" />);

    expect(html).toContain("freshness-table-footer");
    expect(html).toContain("GROUNDED");
    expect(html).toContain("SNAPSHOT");
  });
});
