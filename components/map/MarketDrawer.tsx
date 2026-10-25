"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { ProvenanceChip } from "@/components/shell/ProvenanceChip";
import { SourceLink } from "@/components/shell/SourceLink";
import { TIER_RATIONALE_COPY as tierRationaleCopy } from "@/lib/map/tier-rationale";
import type { MarketDrawerModel } from "./market-details";

type MarketDetail = MarketDrawerModel & {
  market: {
    geoid: string;
    name: string;
    state: string;
    tier: number;
    score: number;
    population: { asianIndian: number; moe: number };
    concentration: { localSharePct: number; multipleOfUS: number };
    moeReliability: string;
    anchorSummary?: {
      temples: number;
      groceries: number;
      cricket: number;
      theaters: number;
      per10kAI: number;
    };
    employmentProxy?: { lcaFilings: number; topEmployers: string[] };
    students?: { activeIndianStudents: number };
  };
};

interface MarketDrawerProps {
  detail: MarketDetail;
  onAnchorFocus?: (anchor: {
    id: string;
    lat: number;
    lng: number;
    name: string;
  }) => void;
  onClose: () => void;
}

function formatNumber(value = 0) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatPct(value = 0) {
  return `${value.toFixed(1)}%`;
}

function tierLabel(tier: number) {
  if (tier === 1) return "Tier 1 · Launch planning";
  if (tier === 2) return "Tier 2 · Growth";
  if (tier === 3) return "Tier 3 · Discovery";
  return "Tier 4 · Audit hold";
}

function anchorGlyph(kind: string) {
  if (kind === "temple") return "▲";
  if (kind === "grocery") return "●";
  if (kind === "cricket") return "◆";
  return "■";
}

function anchorLabel(anchor: MarketDrawerModel["anchorRows"][number]) {
  return anchor.displayName ?? anchor.name;
}

function canFocusAnchor(anchor: MarketDrawerModel["anchorRows"][number]) {
  return Number.isFinite(anchor.lat) && Number.isFinite(anchor.lng);
}

function cinemaSignalLine(detail: MarketDetail) {
  const count = detail.cinema.theaterSignalCount;
  if (count === 0) {
    return "No Indian-cinema signals captured";
  }

  return `${formatNumber(count)} theater signals, city level`;
}

export function MarketDrawer({ detail, onAnchorFocus, onClose }: MarketDrawerProps) {
  const { market } = detail;
  const anchors = market.anchorSummary;
  const employment = market.employmentProxy;
  const students = market.students;
  const hasAuditHold = market.tier === 4;
  const hasAnchorSamples = detail.anchorRows.length > 0;

  return (
    <aside className="market-drawer" aria-label={`${market.name} market evidence`}>
      <section className="drawer-header" aria-labelledby="drawer-market-header">
        <div className="drawer-header-row">
          <div>
            <h2 id="drawer-market-header">{market.name}</h2>
            <div className="drawer-meta">
              {market.state} · {market.geoid} · score{" "}
              <span>{Math.round(market.score)}</span>
            </div>
          </div>
          <button className="btn btn-ghost drawer-close" type="button" onClick={onClose}>
            <X size={16} aria-hidden="true" />
            <span className="sr-only">Close drawer</span>
          </button>
        </div>
        <div className="drawer-chip-row">
          <span className="tier-chip">
            <i className={`tier-dot tier-dot-${market.tier}`} aria-hidden="true" />
            {tierLabel(market.tier)}
          </span>
          <ProvenanceChip provenance="grounded" release="ACS 2024 5yr" />
        </div>
        <p className="drawer-tier-rationale">{tierRationaleCopy}</p>
      </section>

      <div className="drawer-body">
        {hasAuditHold ? (
          <div className="drawer-banner">
            Audit hold: below evidence threshold, shown for transparency.
          </div>
        ) : null}

        <section className="drawer-section" aria-labelledby="drawer-population">
          <h3 id="drawer-population">Population</h3>
          <div className="drawer-stat-row">
            <span>Asian Indian population</span>
            <b>
              {formatNumber(market.population.asianIndian)} ±{" "}
              {formatNumber(market.population.moe)}
            </b>
          </div>
          <div className="drawer-stat-row">
            <span>Local share</span>
            <b>{formatPct(market.concentration.localSharePct)}</b>
          </div>
          <div className="drawer-stat-row">
            <span>Multiple of US share</span>
            <b>{market.concentration.multipleOfUS.toFixed(1)}×</b>
          </div>
          <div className="drawer-stat-row">
            <span>Estimate reliability</span>
            <span className="reliability-badge">{market.moeReliability}</span>
          </div>
          <div className="drawer-source-row">
            <SourceLink href="https://api.census.gov/data/2024/acs/acs5.html">
              Census ACS B02015
            </SourceLink>
            <span>release 2024 5yr</span>
          </div>
        </section>

        <section className="drawer-section" aria-labelledby="drawer-anchors">
          <h3 id="drawer-anchors">
            {hasAnchorSamples
              ? `Community anchors · ${formatNumber(detail.anchorTotal)} mapped · ${
                  anchors?.per10kAI.toFixed(1) ?? "n/a"
                } per 10k`
              : "Community anchors · coverage note"}
          </h3>
          {hasAnchorSamples ? (
            <div className="anchor-count-grid">
              <span>▲ {formatNumber(anchors?.temples ?? 0)} temples</span>
              <span>● {formatNumber(anchors?.groceries ?? 0)} groceries</span>
              <span>◆ {formatNumber(anchors?.cricket ?? 0)} cricket</span>
              <span>■ {cinemaSignalLine(detail)}</span>
            </div>
          ) : null}
          <div className="cinema-evidence-row">
            <ProvenanceChip provenance="snapshot" date={detail.cinema.capturedAt} />
            {detail.cinema.languageSummary ? (
              <span>{detail.cinema.languageSummary}</span>
            ) : null}
          </div>
          {detail.anchorRows.slice(0, 5).map((anchor) => (
            <div className="anchor-row" key={anchor.id}>
              {canFocusAnchor(anchor) ? (
                <button
                  className="anchor-row-button"
                  type="button"
                  aria-label={`Focus ${anchorLabel(anchor)} on map`}
                  onClick={() =>
                    onAnchorFocus?.({
                      id: anchor.id,
                      lat: anchor.lat as number,
                      lng: anchor.lng as number,
                      name: anchor.name,
                    })
                  }
                >
                  {anchorGlyph(anchor.kind)} {anchorLabel(anchor)}
                  {anchor.qaFlags.length > 0 ? (
                    <em> · {anchor.qaFlags.join(", ")}</em>
                  ) : null}
                </button>
              ) : (
                <span>
                  {anchorGlyph(anchor.kind)} {anchorLabel(anchor)}
                  {anchor.qaFlags.length > 0 ? (
                    <em> · {anchor.qaFlags.join(", ")}</em>
                  ) : null}
                </span>
              )}
              <SourceLink href={anchor.osmUrl}>OSM</SourceLink>
            </div>
          ))}
          {detail.anchorRows.length > 5 ? (
            <details className="anchor-details">
              <summary>Show all {detail.anchorRows.length} sample anchors</summary>
              {detail.anchorRows.slice(5).map((anchor) => (
                <div className="anchor-row" key={anchor.id}>
                  {canFocusAnchor(anchor) ? (
                    <button
                      className="anchor-row-button"
                      type="button"
                      aria-label={`Focus ${anchorLabel(anchor)} on map`}
                      onClick={() =>
                        onAnchorFocus?.({
                          id: anchor.id,
                          lat: anchor.lat as number,
                          lng: anchor.lng as number,
                          name: anchor.name,
                        })
                      }
                    >
                      {anchorGlyph(anchor.kind)} {anchorLabel(anchor)}
                    </button>
                  ) : (
                    <span>
                      {anchorGlyph(anchor.kind)} {anchorLabel(anchor)}
                    </span>
                  )}
                  <SourceLink href={anchor.osmUrl}>OSM</SourceLink>
                </div>
              ))}
            </details>
          ) : null}
          {!hasAnchorSamples ? (
            <p className="method-note">
              Anchor coverage currently comes from the audited v1 pocket-market
              snapshot. This market has no sample rows in that snapshot, so no
              local anchor count is inferred.
            </p>
          ) : null}
        </section>

        {detail.personaInsights.length > 0 ? (
          <section className="drawer-section persona-insights" aria-labelledby="drawer-personas">
            <div className="drawer-section-heading">
              <h3 id="drawer-personas">What this mix suggests</h3>
              <ProvenanceChip provenance="derived" />
            </div>
            <div className="persona-insight-list">
              {detail.personaInsights.slice(0, 3).map((line) => (
                <Link href={line.href} key={line.text}>
                  {line.text}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="drawer-section" aria-labelledby="drawer-employment">
          <h3 id="drawer-employment">Employment proxy</h3>
          <div className="drawer-stat-row">
            <span>H-1B employer filings (LCA), FY2026</span>
            <b>{formatNumber(employment?.lcaFilings ?? 0)}</b>
          </div>
          <div className="drawer-stat-row">
            <span>Top employers</span>
            <span className="drawer-list-text">
              {employment?.topEmployers.slice(0, 4).join(", ") || "No matched filings"}
            </span>
          </div>
          <p className="boundary-line">
            H-1B LCA certification is employer filing intent, not USCIS
            approval, headcount, nationality, or individual location proof.
            Treat as an employer/workforce proxy.
          </p>
          <div className="drawer-source-row">
            <SourceLink href="https://www.dol.gov/agencies/eta/foreign-labor/performance">
              H-1B employer filings (LCA)
            </SourceLink>
            <span>FY2026 Q2</span>
          </div>
        </section>

        <section className="drawer-section" aria-labelledby="drawer-students">
          <h3 id="drawer-students">Students</h3>
          <div className="drawer-stat-row">
            <span>Active Indian students, state-allocated</span>
            <b>{formatNumber(students?.activeIndianStudents ?? 0)}</b>
          </div>
          <p className="method-note">
            SEVIS state-level count allocated by Asian Indian population share.
          </p>
          <div className="drawer-source-row">
            <SourceLink href="https://studyinthestates.dhs.gov/sevis-by-the-numbers/sevis-by-the-numbers-data">
              SEVIS by the Numbers
            </SourceLink>
            <span>August 2025</span>
          </div>
        </section>

        <section className="drawer-section" aria-labelledby="drawer-cinema">
          <h3 id="drawer-cinema">Cinema footprint</h3>
          <div className="drawer-stat-row">
            <span>City-level theater signals</span>
            <b>{detail.cinema.theaterSignalCount > 0 ? formatNumber(detail.cinema.theaterSignalCount) : "none"}</b>
          </div>
          {detail.cinema.exampleTheaters.length > 0 ? (
            <p className="method-note">
              {detail.cinema.exampleTheaters.join(", ")}
              {detail.cinema.languageSummary ? ` · ${detail.cinema.languageSummary}` : ""}
            </p>
          ) : (
            <p className="method-note">No Indian-cinema signals captured.</p>
          )}
          <div className="drawer-source-row">
            <SourceLink href="/sources">Cinema snapshot</SourceLink>
            <span>{detail.cinema.capturedAt}</span>
          </div>
        </section>

        <section className="drawer-cta-row" aria-label="Next actions">
          <Link className="btn btn-primary" href={`/playbook?market=${market.geoid}#market-snapshot`}>
            Open playbook for this market
          </Link>
          <Link className="btn" href={`/competitors?market=${market.geoid}`}>
            View competitor pressure
          </Link>
        </section>
      </div>
    </aside>
  );
}
