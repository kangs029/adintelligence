import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  artifactMetadata,
  displayArtifactCadence,
  displayArtifactFile,
  displayArtifactMethod,
  displayArtifactSource,
} from "@/lib/data/artifact-metadata";
import SourcesPage from "./page";

describe("SourcesPage", () => {
  it("renders methodology and caveats for every artifact family", () => {
    const html = renderToStaticMarkup(<SourcesPage />);

    expect(html).toContain("Freshness table");
    expect(html).toContain('id="source-fx-snapshots"');
    expect(html).toContain("Wise quotes are fetched server-side");
    expect(html).toContain("not a browser GET page");
    for (const row of artifactMetadata()) {
      expect(html).toContain(row.family);
      expect(html).toContain(displayArtifactFile(row.file));
      expect(html).toContain(displayArtifactMethod(row.method));
      expect(html).toContain(displayArtifactCadence(row.refreshCadence));
      expect(html).toContain(displayArtifactSource(row.source));
      expect(html).toContain(row.caveats[0]);
    }
    expect(html).not.toContain("manual v1 port");
    expect(html).not.toContain("daily or before demos");
    expect(html).not.toContain("OFLC");
    expect(html).toContain("curated import, dated");
    expect(html).toContain("operator-verified sweep");
  });

  it("keeps missing-access accounting explicit", () => {
    const html = renderToStaticMarkup(<SourcesPage />);

    expect(html).toContain("Connector-needed rows");
    expect(html).toContain("rendered as missing access, not invented data");
    expect(html).toContain("0");
    expect(html).toContain("geo-visibility");
  });
});
