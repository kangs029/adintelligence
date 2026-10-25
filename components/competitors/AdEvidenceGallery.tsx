"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { ProvenanceChip } from "@/components/shell/ProvenanceChip";
import { SourceLink } from "@/components/shell/SourceLink";
import { providerColors } from "./provider-colors";

type AdEvidenceRecord = {
  bodyText: string | null;
  capturedAt: string;
  caveat: string | null;
  advertiser?: string | null;
  brand?: string | null;
  competitor: string;
  evidenceRole?: string | null;
  firstSeen: string | null;
  headline: string | null;
  id: string;
  landingPage?: string | null;
  lastShown?: string | null;
  mediaType: string | null;
  placement?: string | null;
  platform: "Meta" | "Google" | "Site";
  screenshotPath: string | null;
  screenshotRawPath?: string | null;
  sourceUrl: string;
  status: "snapshot" | "no-public-ads-captured" | "blocked";
  sweepLabel?: string | null;
  themes: string[];
};

type XpatFootprintArtifact = {
  data: {
    observations: {
      capturedAt: string;
      id: string;
      sourcePlatform: string;
      sourceUrl: string;
      summary: string;
      title: string;
    }[];
    summary: string;
  };
};

export type AdEvidenceArtifact = {
  data: {
    records: AdEvidenceRecord[];
    window: { from: string; to: string };
  };
};

interface AdEvidenceGalleryProps {
  artifact: AdEvidenceArtifact;
  xpatFootprint?: XpatFootprintArtifact;
}

function unique(values: string[]) {
  return [...new Set(values)].sort();
}

function formatDate(value: string) {
  return value.slice(0, 10);
}

function formatSweepDate(value: string) {
  const [year, month, day] = formatDate(value).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

function colorFor(competitor: string) {
  return providerColors[competitor as keyof typeof providerColors] ?? "var(--ink-muted)";
}

function groupByPlatform(records: AdEvidenceRecord[]) {
  const groups = new Map<AdEvidenceRecord["platform"], AdEvidenceRecord[]>();

  for (const record of records) {
    if (!groups.has(record.platform)) groups.set(record.platform, []);
    groups.get(record.platform)?.push(record);
  }

  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function displayBrand(record: AdEvidenceRecord) {
  if (record.competitor === "Xpat" || record.evidenceRole === "owned benchmark") {
    return "Xpat, owned benchmark";
  }

  return record.brand ?? record.competitor;
}

function sourceLabel(record: AdEvidenceRecord) {
  if (record.platform === "Site") return "source";
  return "external link";
}

function displayRole(record: AdEvidenceRecord) {
  if (record.evidenceRole === "category context") {
    return "category context, not USD to INR proof";
  }

  return record.evidenceRole;
}

function cleanEvidenceText(value: string | null | undefined) {
  if (!value) return null;

  if (
    /structured sampleAd row|derived from the filename|matching v1 observation/iu.test(value)
  ) {
    return "Screenshot retained from the June 2026 evidence port. Text unavailable in public DOM.";
  }

  if (/visible in the screenshot but was not exposed as DOM text/iu.test(value)) {
    return "Text unavailable in public DOM. Use the screenshot as primary evidence.";
  }

  return value.replace(/[\u2013\u2014]/gu, "-");
}

function displayHeadline(record: AdEvidenceRecord) {
  return cleanEvidenceText(record.headline) ?? cleanEvidenceText(record.caveat) ?? "Public creative screenshot captured.";
}

function displayBody(record: AdEvidenceRecord) {
  const body = cleanEvidenceText(record.bodyText);
  const headline = cleanEvidenceText(record.headline);
  return body && body !== headline ? body : null;
}

function adMetaItems(record: AdEvidenceRecord) {
  return [
    record.platform,
    record.mediaType,
    record.placement,
    record.firstSeen ? `First seen ${record.firstSeen}` : null,
    record.lastShown ? `Last shown ${record.lastShown}` : null,
    `Captured ${formatDate(record.capturedAt)}`,
  ].filter(Boolean);
}

function sweepTitle(record: AdEvidenceRecord) {
  return record.sweepLabel ?? `${formatSweepDate(record.capturedAt)} sweep`;
}

function sortAdRecords(left: AdEvidenceRecord, right: AdEvidenceRecord) {
  const leftOwned = left.competitor === "Xpat" || left.evidenceRole === "owned benchmark";
  const rightOwned = right.competitor === "Xpat" || right.evidenceRole === "owned benchmark";
  if (leftOwned !== rightOwned) return leftOwned ? -1 : 1;

  const leftContext = left.evidenceRole === "category context";
  const rightContext = right.evidenceRole === "category context";
  if (leftContext !== rightContext) return leftContext ? 1 : -1;

  return displayBrand(left).localeCompare(displayBrand(right)) || left.id.localeCompare(right.id);
}

function groupBySweep(records: AdEvidenceRecord[]) {
  const groups = new Map<string, AdEvidenceRecord[]>();

  for (const record of records) {
    const title = sweepTitle(record);
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title)?.push(record);
  }

  return [...groups.entries()]
    .map(([title, groupRecords]) => ({
      records: [...groupRecords].sort(sortAdRecords),
      sortKey: formatDate(groupRecords[0].capturedAt),
      title,
    }))
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey));
}

export function AdEvidenceGallery({ artifact, xpatFootprint }: AdEvidenceGalleryProps) {
  const [platformFilter, setPlatformFilter] = useState("All");
  const records = artifact.data.records;
  const platforms = useMemo(() => ["All", ...unique(records.map((record) => record.platform))], [records]);
  const filteredRecords = records.filter(
    (record) => platformFilter === "All" || record.platform === platformFilter,
  );
  const platformGroups = groupByPlatform(filteredRecords);
  const capturedRecords = filteredRecords.filter((record) => record.status === "snapshot");
  const missedRecords = filteredRecords.filter((record) => record.status !== "snapshot");
  const sweepGroups = groupBySweep(capturedRecords);
  const zeroCapture = capturedRecords.length === 0;

  return (
    <section className="evidence-section" aria-labelledby="ad-evidence-title">
      <div className="cardhead">
        <div>
          <h2 id="ad-evidence-title">Ad evidence</h2>
          <p className="section-subtitle">
            Meta and Google public libraries, window {artifact.data.window.from} to{" "}
            {artifact.data.window.to}.
          </p>
        </div>
        <ProvenanceChip date={artifact.data.window.to} provenance="snapshot" />
      </div>

      {xpatFootprint ? (
        <div className="owned-footprint-strip">
          <div>
            <strong>Xpat footprint is visible</strong>
            <p>{xpatFootprint.data.summary}</p>
          </div>
          <div className="source-row">
            <SourceLink href="/signals#xpat-footprint-title">Signals card</SourceLink>
            {xpatFootprint.data.observations.map((observation) => (
              <SourceLink href={observation.sourceUrl} key={observation.id}>
                {observation.sourcePlatform}
              </SourceLink>
            ))}
          </div>
        </div>
      ) : null}

      <div className="gallery-filters" aria-label="Ad evidence filters">
        {platforms.map((platform) => (
          <button
            aria-pressed={platformFilter === platform}
            className="filter-pill"
            key={platform}
            onClick={() => setPlatformFilter(platform)}
            type="button"
          >
            {platform}
          </button>
        ))}
      </div>

      {zeroCapture ? (
        <div className="ad-gallery compact-ad-gallery">
          <article className="ad-summary-card compact-ad-strip">
            <div className="ad-card-body">
              <div className="ad-meta-row">
                <h3>0 public ads captured, manual screenshot evidence pass pending</h3>
                <ProvenanceChip date={formatDate(filteredRecords[0].capturedAt)} provenance="snapshot" />
              </div>
              <p>
                Sweep window {artifact.data.window.from} to {artifact.data.window.to}.
              </p>
              <p>Swept competitors: {unique(filteredRecords.map((record) => record.competitor)).join(", ")}</p>
              <div className="ad-summary-rows">
                {filteredRecords.map((record) => (
                  <details key={record.id}>
                    <summary>
                      <span>
                        <i style={{ background: colorFor(record.competitor) }} />
                        {record.platform} · {record.competitor}
                      </span>
                    </summary>
                    <p>{cleanEvidenceText(record.caveat) ?? "No parseable public ad card text captured."}</p>
                    <SourceLink href={record.sourceUrl}>source</SourceLink>
                  </details>
                ))}
              </div>
            </div>
          </article>
        </div>
      ) : (
        <>
          {sweepGroups.map((group) => (
            <div className="ad-sweep-group" key={group.title}>
              <div className="mini-section-heading">
                <h3>{group.title}</h3>
                <p>
                  {group.records.filter((record) => record.screenshotPath).length} image-backed
                  captures
                </p>
              </div>
              <div className="ad-gallery">
                {group.records.map((record) => (
                  <article className="ad-card" key={record.id}>
                    <div className="ad-thumb">
                      {record.screenshotPath ? (
                        <Image
                          alt={`${displayBrand(record)} ${record.platform} public ad capture`}
                          fill
                          sizes="132px"
                          src={record.screenshotPath}
                        />
                      ) : (
                        <span>{record.platform}</span>
                      )}
                    </div>
                    <div className="ad-card-body">
                      <div className="ad-meta-row">
                        <h3>
                          <i style={{ background: colorFor(record.competitor) }} />
                          {displayBrand(record)}
                        </h3>
                        <ProvenanceChip date={formatDate(record.capturedAt)} provenance="snapshot" />
                      </div>
                      {record.evidenceRole ? (
                        <span className="ad-role-chip">{displayRole(record)}</span>
                      ) : null}
                      <p className="ad-headline">{displayHeadline(record)}</p>
                      {displayBody(record) ? <p>{displayBody(record)}</p> : null}
                      <div className="ad-foot">
                        <span>{adMetaItems(record).join(" · ")}</span>
                        <SourceLink href={record.sourceUrl}>{sourceLabel(record)}</SourceLink>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}

          {missedRecords.length > 0 ? (
            <div className="ad-summary-rows ad-missed-rows">
              <details>
                <summary>
                  <span>Sources with no captured public ad card in this pass</span>
                </summary>
                {missedRecords.map((record) => (
                  <p key={record.id}>
                    {record.platform} · {record.competitor}:{" "}
                    {cleanEvidenceText(record.caveat) ?? "No parseable public ad card text captured."}{" "}
                    <SourceLink href={record.sourceUrl}>source</SourceLink>
                  </p>
                ))}
              </details>
            </div>
          ) : null}

          <div className="ad-summary-rows ad-platform-rows" aria-label="Ad evidence source groups">
            {platformGroups.map(([platform, platformRecords]) => (
              <details key={platform}>
                <summary>
                  <span>{platform} records in current filter</span>
                </summary>
                <p>
                  {platformRecords.filter((record) => record.status === "snapshot").length} captured,{" "}
                  {platformRecords.filter((record) => record.status !== "snapshot").length} not captured.
                </p>
              </details>
            ))}
          </div>
        </>
      )}

      <p className="boundary-line">
        Public creative proves visible footprint. It does not prove spend,
        targeting, delivery, or performance.
      </p>
    </section>
  );
}
