"use client";

import { useMemo, useState } from "react";
import type { FxProviderName, FxSnapshot } from "@/lib/data/fx";
import { providerColors } from "./provider-colors";

interface MarginTrendProps {
  snapshots: readonly FxSnapshot[];
}

type Point = {
  capturedAt: string;
  margin: number;
  x: number;
  y: number;
};

const chart = {
  width: 900,
  height: 260,
  left: 48,
  right: 112,
  top: 28,
  bottom: 42,
};

const ticks = [0, 0.5, 1, 1.5, 2];

function effectiveMargin(snapshot: FxSnapshot, provider: FxProviderName) {
  const row = snapshot.providers.find((candidate) => candidate.provider === provider);
  if (!row || row.receiveAmountFor1000USD === null) return undefined;

  const effectiveRate = row.receiveAmountFor1000USD / 1000;
  return ((snapshot.midMarket.rate - effectiveRate) / snapshot.midMarket.rate) * 100;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function formatPct(value: number) {
  return `${value.toFixed(2)}%`;
}

function pathFor(points: Point[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
}

function buildSeries(snapshots: readonly FxSnapshot[]) {
  const sorted = [...snapshots].sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
  const innerWidth = chart.width - chart.left - chart.right;
  const innerHeight = chart.height - chart.top - chart.bottom;

  return (Object.keys(providerColors) as FxProviderName[])
    .map((provider) => {
      const points = sorted
        .map((snapshot, index) => {
          const margin = effectiveMargin(snapshot, provider);
          if (margin === undefined) return undefined;

          const x =
            sorted.length === 1
              ? chart.left
              : chart.left + (index / (sorted.length - 1)) * innerWidth;
          const clamped = Math.max(0, Math.min(2, margin));
          const y = chart.top + innerHeight - (clamped / 2) * innerHeight;

          return { capturedAt: snapshot.capturedAt, margin, x, y };
        })
        .filter((point): point is Point => Boolean(point));

      return { provider, points };
    })
    .filter((series) => series.points.length > 0);
}

function uniqueSnapshotDays(snapshots: readonly FxSnapshot[]) {
  return [...new Set(snapshots.map((snapshot) => snapshot.capturedAt.slice(0, 10)))].sort();
}

export function MarginTrend({ snapshots }: MarginTrendProps) {
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const series = useMemo(() => buildSeries(snapshots), [snapshots]);
  const snapshotDays = uniqueSnapshotDays(snapshots);
  const firstDate = snapshotDays[0];
  const lastDate = snapshotDays.at(-1);
  const collecting = snapshotDays.length < 7;
  const pointCount = series.reduce((sum, row) => sum + row.points.length, 0);

  return (
    <section className="evidence-section" aria-labelledby="margin-trend-title">
      <div className="cardhead">
        <div>
          <h2 id="margin-trend-title">Daily margin snapshots</h2>
          <p className="section-subtitle">
            {collecting
              ? `${snapshotDays.length} days tracked, trend line unlocks at 7. ${pointCount} provider dots captured.`
              : "Lower is cheaper for the customer. One measure, one axis."}
          </p>
        </div>
      </div>
      <div className={`chart-card${collecting ? " collecting-card" : ""}`}>
        {collecting ? (
          <p className="collecting-state">
            Daily snapshots started {firstDate ? formatDate(firstDate) : "today"}. Dots are shown
            now, trend line appears after 7 daily snapshots. The chart keeps up to 90 days once
            history exists.
          </p>
        ) : null}
        <svg
          aria-label="Daily effective margin snapshots by provider"
          className="margin-chart"
          role="img"
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          onMouseLeave={() => setHoverPoint(null)}
        >
          {ticks.map((tick) => {
            const y = chart.top + (1 - tick / 2) * (chart.height - chart.top - chart.bottom);
            return (
              <g key={tick}>
                <line
                  className="chart-gridline"
                  x1={chart.left}
                  x2={chart.width - chart.right}
                  y1={y}
                  y2={y}
                />
                <text className="chart-axis" x={8} y={y + 4}>
                  {tick.toFixed(1)}%
                </text>
              </g>
            );
          })}
          {firstDate ? (
            <text className="chart-axis" x={chart.left} y={chart.height - 10}>
              {formatDate(firstDate)}
            </text>
          ) : null}
          {lastDate ? (
            <text className="chart-axis" x={chart.width - chart.right - 44} y={chart.height - 10}>
              {formatDate(lastDate)}
            </text>
          ) : null}
          {series.map(({ provider, points }) => {
            const last = points.at(-1);
            return (
              <g key={provider}>
                {!collecting && points.length > 1 ? (
                  <path
                    className="chart-line"
                    d={pathFor(points)}
                    fill="none"
                    stroke={providerColors[provider]}
                  />
                ) : null}
                {points.map((point) => (
                  <circle
                    key={`${provider}-${point.capturedAt}`}
                    cx={point.x}
                    cy={point.y}
                    fill={providerColors[provider]}
                    r={4}
                    onMouseEnter={() => setHoverPoint(point)}
                  >
                    <title>{`${provider}: ${formatPct(point.margin)} on ${formatDate(point.capturedAt)}`}</title>
                  </circle>
                ))}
                {last ? (
                  <text
                    className="chart-direct-label"
                    fill={providerColors[provider]}
                    x={last.x + 8}
                    y={last.y + 4}
                  >
                    {provider}
                  </text>
                ) : null}
              </g>
            );
          })}
          {hoverPoint ? (
            <line
              className="chart-crosshair"
              x1={hoverPoint.x}
              x2={hoverPoint.x}
              y1={chart.top}
              y2={chart.height - chart.bottom}
            />
          ) : null}
        </svg>
        <div className="chart-legend" aria-label="Provider color legend">
          {series.map(({ provider }) => (
            <span key={provider}>
              <i style={{ background: providerColors[provider] }} />
              {provider}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
