import { ProvenanceChip } from "@/components/shell/ProvenanceChip";
import { SourceLink } from "@/components/shell/SourceLink";
import type { PlaybookDossierModel } from "@/lib/playbook/dossier";
import { CopyDataAskButton } from "./CopyDataAskButton";
import { CopyGeoPackButton } from "./CopyGeoPackButton";
import { MeasurementProofGate } from "./MeasurementProofGate";

interface PlaybookDossierProps {
  dossier: PlaybookDossierModel;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatPct(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "USD",
  }).format(value);
}

function shortMarketName(name: string) {
  return name.split("-")[0].split(",")[0].trim();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function RateTimingChart({ fxHistory }: { fxHistory: PlaybookDossierModel["fxHistory"] }) {
  if (!fxHistory?.rates.length) {
    return (
      <div className="rate-timing rate-timing-empty">
        <ProvenanceChip provenance="connector-needed" />
        <h3>FX history needs refresh</h3>
        <p>
          Frankfurter rate history could not refresh during the latest pipeline run. Rerun playbook-context once the source is reachable.
        </p>
      </div>
    );
  }

  const width = 520;
  const height = 160;
  const padding = 24;
  const rates = fxHistory.rates;
  const values = rates.map((point) => point.rate);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const xScale = (index: number) =>
    padding + (index / Math.max(1, rates.length - 1)) * (width - padding * 2);
  const yScale = (value: number) => {
    const span = max - min || 1;
    return height - padding - ((value - min) / span) * (height - padding * 2);
  };
  const points = rates.map((point, index) => `${xScale(index)},${yScale(point.rate)}`).join(" ");
  const current = rates.at(-1)!;
  const currentX = xScale(rates.length - 1);
  const currentY = yScale(current.rate);

  return (
    <div className="rate-timing">
      <svg className="fx-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="12 month USD to INR history">
        <line className="chart-gridline" x1={padding} x2={width - padding} y1={padding} y2={padding} />
        <line className="chart-gridline" x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} />
        <polyline className="chart-line fx-chart-line" fill="none" points={points} />
        <circle className="fx-current-dot" cx={currentX} cy={currentY} r="5" />
        <text className="chart-axis" x={padding} y={height - 6}>
          {formatDate(fxHistory.startDate)}
        </text>
        <text className="chart-axis" textAnchor="end" x={width - padding} y={height - 6}>
          {formatDate(fxHistory.endDate)}
        </text>
        <text className="chart-axis" textAnchor="end" x={width - padding} y={padding - 8}>
          {current.rate.toFixed(2)} INR
        </text>
      </svg>
      <p>
        Rate timing is a real trigger for remitters. Content and offers keyed to rate movements meet customers at their decision moment.
      </p>
      <div className="source-row">
        <SourceLink href={fxHistory.sourceUrl}>Frankfurter historical rates</SourceLink>
      </div>
    </div>
  );
}

type Contribution = PlaybookDossierModel["personas"][number]["contributions"][number];

function plusPoints(value: number) {
  return `+${Math.round(value)}`;
}

function scorePct(score: number) {
  return `${Math.max(0, Math.min(100, score))}%`;
}

function zoneMixLine(zone: PlaybookDossierModel["targetZones"][number]) {
  return `▲ ${zone.mix.temples} temples, ● ${zone.mix.groceries} groceries, ◆ ${zone.mix.cricket} cricket, ■ ${zone.mix.theaters} theaters`;
}

function fitLabelClass(fit: string) {
  if (fit === "strong") return "fit-strong";
  if (fit === "possible") return "fit-possible";
  return "fit-weak";
}

function contributionLine(contribution: Contribution, market: PlaybookDossierModel["market"]) {
  const points = plusPoints(contribution.weightedPoints);
  const anchors = market.anchorSummary;

  if (contribution.feature === "population") {
    return `large audience base (${formatNumber(market.population.asianIndian)} Asian Indian, ${points})`;
  }
  if (contribution.feature === "concentration") {
    return `high local concentration (${market.concentration.multipleOfUS.toFixed(1)}x US share, ${points})`;
  }
  if (contribution.feature === "income" && market.income) {
    return `high household income (${formatCurrency(market.income.medianHousehold)} median, ${points})`;
  }
  if (contribution.feature === "lcaDensity" || contribution.feature === "lcaVolume") {
    return `H-1B employer filing proxy (${formatNumber(market.employmentProxy?.lcaFilings ?? 0)} LCA filings, ${points})`;
  }
  if (contribution.feature === "studentShare" || contribution.feature === "studentVolume") {
    return `student remittance proxy (${formatNumber(market.students?.activeIndianStudents ?? 0)} active Indian students, ${points})`;
  }
  if (contribution.feature === "anchorDensity" || contribution.feature === "anchorMix") {
    return `community place evidence (${anchors ? `${anchors.temples + anchors.groceries + anchors.cricket + anchors.theaters} audited places` : "coverage pending"}, ${points})`;
  }
  if (contribution.feature === "groceries") {
    return `Indian grocery evidence (${anchors?.groceries ?? 0} audited places, ${points})`;
  }
  if (contribution.feature === "temples") {
    return `temple and community evidence (${anchors?.temples ?? 0} audited places, ${points})`;
  }
  if (contribution.feature === "cricket") {
    return `cricket ground evidence (${anchors?.cricket ?? 0} audited places, ${points})`;
  }
  if (contribution.feature === "theaters") {
    return `theater evidence (${anchors?.theaters ?? 0} audited places, ${points})`;
  }

  return `${contribution.label.toLowerCase()} contribution (${points})`;
}

export function PlaybookDossier({ dossier }: PlaybookDossierProps) {
  const market = dossier.market;
  const hasCorridorEstimate = dossier.corridor.estimateUsd !== null;
  const tocSections = [
    ["Market wedge", "market-wedge"],
    ["Market snapshot", "market-snapshot"],
    ["Corridor plays", "corridor-plays"],
    ["Personas", "personas"],
    ["Channel plan", "channel-plan"],
    ["Target zones", "target-zones"],
    ["Content topics", "content-topics"],
    ["Offline surfaces", "offline-surfaces"],
    ["Experiment plan", "experiment-plan"],
    ["Creative angles", "creative-angles"],
    ["Rate timing", "rate-timing"],
    ["Measurement spec", "measurement-spec"],
    ["What we need", "what-we-need-from-xpat"],
    ["From proof", "from-evidence-to-proof"],
  ];

  return (
    <section className="playbook-dossier" aria-label={`${market.name} playbook dossier`}>
      <nav className="playbook-toc" aria-label="Dossier sections">
        {tocSections.map(([label, id]) => (
          <a href={`#${id}`} key={id}>
            {label}
          </a>
        ))}
      </nav>

      <div className="playbook-sections">
        <section className="playbook-section playbook-hero-section" id="market-wedge">
          <div className="cardhead">
            <div>
              <h2>Market wedge</h2>
              <p className="section-subtitle">Why this market gets a specific entry hypothesis.</p>
            </div>
            <ProvenanceChip provenance={hasCorridorEstimate ? "derived" : "connector-needed"} />
          </div>
          <p className="wedge-line">{dossier.wedgeLine}</p>
          <div className="corridor-context">
            <div>
              <span>{hasCorridorEstimate ? "Derived corridor estimate" : "Corridor source refresh needed"}</span>
              <strong>{dossier.corridor.estimateLabel}</strong>
              <p>
                {hasCorridorEstimate
                  ? "Order-of-magnitude estimate for this metro's share of US-to-India remittance flow."
                  : "No corridor estimate is shown until the source refresh succeeds."}
              </p>
            </div>
            <details>
              <summary>Method note</summary>
              <p>{dossier.corridor.method}</p>
              <div className="source-row">
                {dossier.corridor.sourceLinks.map((link) => (
                  <SourceLink href={link.href} key={link.href}>
                    {link.label}
                  </SourceLink>
                ))}
              </div>
            </details>
          </div>
        </section>

        <section className="playbook-section" id="market-snapshot">
          <div className="cardhead">
            <div>
              <h2>Market snapshot</h2>
              <p className="section-subtitle">{market.name}</p>
            </div>
            <ProvenanceChip provenance="grounded" release="ACS 2024 5yr" />
          </div>
          <div className="snapshot-grid">
            <div>
              <span>Asian Indian population</span>
              <strong>{formatNumber(market.population.asianIndian)}</strong>
            </div>
            <div>
              <span>Local share</span>
              <strong>{formatPct(market.concentration.localSharePct)}</strong>
            </div>
            <div>
              <span>Score</span>
              <strong>{Math.round(market.score ?? 0)}</strong>
            </div>
            <div>
              <span>Tier</span>
              <strong>{market.tier}</strong>
            </div>
          </div>
          <div className="source-row">
            <SourceLink href="/">map evidence</SourceLink>
            <SourceLink href="https://api.census.gov/data/2024/acs/acs5.html">Census ACS</SourceLink>
          </div>
          <p className="method-note">
            Census method: ACS 2024 5-year detailed table B02015, Asian Indian alone population.
          </p>
        </section>

        <section className="playbook-section" id="corridor-plays">
          <div className="cardhead">
            <div>
              <h2>Corridor plays, apply in every market</h2>
              <p className="section-subtitle">National corridor moves are repeated intentionally, not as local evidence.</p>
            </div>
            <ProvenanceChip provenance="snapshot" />
          </div>
          <div className="play-card-grid">
            {dossier.corridorPlays.map((play) => (
              <article className="offline-card" key={play.title}>
                <h3>{play.title}</h3>
                <p>{play.body}</p>
                <div className="source-row">
                  {play.evidenceLinks.map((link) => (
                    <SourceLink href={link.href} key={`${play.title}-${link.href}`}>
                      {link.label}
                    </SourceLink>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="playbook-section" id="personas">
          <div className="cardhead">
            <div>
              <h2>Personas</h2>
              <p className="section-subtitle">Recommendation scores with confidence and why.</p>
            </div>
            <ProvenanceChip provenance="derived" />
          </div>
          <div className="persona-grid">
            {dossier.personas.map((persona) => (
              <article className="persona-card" key={persona.personaId}>
                <div className="ad-meta-row">
                  <h3>{persona.name}</h3>
                  <span className="confidence-chip" data-confidence={persona.confidence}>
                    {persona.confidence} confidence
                  </span>
                </div>
                <div className="persona-score-row">
                  <span>Fit score</span>
                  <strong className="fit-score">{persona.score.toFixed(0)}/100</strong>
                </div>
                <div
                  aria-label={`${persona.name} fit score ${persona.score.toFixed(0)} out of 100`}
                  className="score-meter"
                  role="img"
                >
                  <i style={{ width: scorePct(persona.score) }} />
                </div>
                <ul className="why-list">
                  {persona.contributions.map((contribution) => (
                    <li key={contribution.feature}>{contributionLine(contribution, market)}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <p className="method-note">
            Score math: visible components use normalized weights and round to the displayed score.
          </p>
        </section>

        <section className="playbook-section" id="channel-plan">
          <span className="anchor-target" id="community" />
          <span className="anchor-target" id="channels" />
          <div className="cardhead">
            <div>
              <h2>Channel plan</h2>
              <p className="section-subtitle">Ranked channels, each tied to evidence and a reference market.</p>
            </div>
            <ProvenanceChip provenance="derived" />
          </div>
          <div className="channel-list">
            {dossier.channels.map((channel) => (
              <article className="channel-row" key={channel.id}>
                <div className="channel-copy">
                  <h3>{channel.name}</h3>
                  <p>{channel.whenFits}</p>
                  <p className="method-note">
                    Benchmark: {shortMarketName(channel.benchmarkMarket.name)} playbook
                  </p>
                  <ul className="why-list">
                    {channel.contributions.map((contribution) => (
                      <li key={contribution.feature}>{contribution.label}: +{Math.round(contribution.weightedPoints)}</li>
                    ))}
                  </ul>
                  {channel.id === "creator-sponsorship" ? (
                    <div className="sponsor-example-list">
                      {dossier.sponsorExamples.slice(0, 2).map((example) => (
                        <p key={`${example.brand}-${example.creator}`}>
                          {example.brand}: {example.creator}, captured {formatDate(example.capturedAt)}.
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="channel-facts">
                  <div>
                    <span>Score</span>
                    <strong>{channel.score.toFixed(0)}</strong>
                  </div>
                  <div>
                    <span>Test band</span>
                    <p>{channel.suggestedTestBudgetEstimate}</p>
                  </div>
                  <div>
                    <span>Reference market</span>
                    <p>{shortMarketName(channel.benchmarkMarket.name)} planning comparator</p>
                  </div>
                  <div>
                    <span>Evidence</span>
                    <div className="source-row">
                      {channel.evidenceLinks.map((link) => (
                        <SourceLink href={link.href} key={link.href}>
                          {link.label}
                        </SourceLink>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="channel-measurement">
                  <span>Primary metric</span>
                  <p>{channel.successMetric}</p>
                </div>
                <div className="channel-method-note">
                  Compare against {shortMarketName(channel.benchmarkMarket.name)} before kickoff. Public evidence
                  supports a test plan, not an outcome forecast.
                </div>
              </article>
            ))}
          </div>
          <p className="method-note">{dossier.sponsorExamples.length ? "Creator channel evidence is observed sponsorship content, never conversion proof." : "Creator channel evidence depends on the Signals creators section."}</p>
          <p className="method-note">
            Score math: visible components use normalized weights and round to the displayed score.
          </p>
        </section>

        <section className="playbook-section" id="target-zones">
          <div className="cardhead">
            <div>
              <h2>Where to point digital ads</h2>
              <p className="section-subtitle">
                Sub-metro localities from temples, Indian groceries, cricket grounds, and theaters, routed into platforms and copy-ready geo setup.
              </p>
            </div>
            <ProvenanceChip provenance={dossier.targetZones.length ? "derived" : "connector-needed"} />
          </div>

          <div className="targeting-toolbar">
            <div>
              <h3>Buyable geo pack</h3>
              <p className="method-note">
                Copy Google, Meta, language, and employer/workforce proxy hints into campaign setup.
              </p>
            </div>
            <CopyGeoPackButton text={dossier.geoPack.text} />
          </div>
          <code className="schema-box geo-pack-preview">{dossier.geoPack.previewLines.join("\n")}</code>

          {dossier.targetZones.length ? (
            <div className="zone-grid">
              {dossier.targetZones.slice(0, 4).map((zone) => (
                <article className="zone-card" key={zone.id}>
                  <div className="ad-meta-row">
                    <h3>{zone.locality}</h3>
                    <span className="claim-contract-chip">{zone.anchorCount} places</span>
                  </div>
                  <p className="zone-mix">{zoneMixLine(zone)}</p>
                  <p>{zone.personaEvidence}</p>
                  {zone.assignedUntaggedCount > 0 ? (
                    <p className="method-note">
                      {zone.assignedUntaggedCount} untagged places joined to the nearest named locality.
                    </p>
                  ) : null}
                  <div className="source-row">
                    {zone.evidenceLinks.map((link) => (
                      <SourceLink href={link.href} key={`${zone.id}-${link.href}`}>
                        {link.label}
                      </SourceLink>
                    ))}
                  </div>
                </article>
              ))}
              {dossier.targetZones.length > 4 ? (
                <details className="zone-more">
                  <summary>Show {dossier.targetZones.length - 4} more target zones</summary>
                  <div className="zone-grid zone-grid-nested">
                    {dossier.targetZones.slice(4, 8).map((zone) => (
                      <article className="zone-card" key={zone.id}>
                        <div className="ad-meta-row">
                          <h3>{zone.locality}</h3>
                          <span className="claim-contract-chip">{zone.anchorCount} places</span>
                        </div>
                        <p className="zone-mix">{zoneMixLine(zone)}</p>
                        <p>{zone.personaEvidence}</p>
                        <div className="source-row">
                          {zone.evidenceLinks.map((link) => (
                            <SourceLink href={link.href} key={`${zone.id}-${link.href}`}>
                              {link.label}
                            </SourceLink>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ) : (
            <div className="connector-state signal-connector">
              <p>No named locality zones can be derived until this market has city-tagged temple, grocery, cricket, or theater rows.</p>
            </div>
          )}

          <div className="platform-routing-wrap">
            <h3>Platform routing by persona</h3>
            <div className="platform-routing-table-wrap">
              <table className="platform-routing-table">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Google Search</th>
                    <th>Meta</th>
                    <th>YouTube/creator</th>
                    <th>Apple Search Ads</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.platformRouting.map((row) => (
                    <tr key={row.personaName}>
                      <th scope="row">{row.personaName}</th>
                      {row.cells.map((cell) => (
                        <td key={`${row.personaName}-${cell.platform}`}>
                          <span className={`platform-fit ${fitLabelClass(cell.fit)}`}>{cell.fit}</span>
                          <p>{cell.why}</p>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="competitor-visibility-box">
            <div className="cardhead">
              <div>
                <h3>Competitor visibility</h3>
                <p className="method-note">{dossier.competitorVisibility.framing}</p>
              </div>
              <span className="claim-contract-chip">
                {dossier.competitorVisibility.state === "captured" ? "PUBLIC CREATIVE" : "CAPTURE STATE"}
              </span>
            </div>
            <div className="competitor-visibility-list">
              {dossier.competitorVisibility.records.map((record) => (
                <article key={`${record.platform}-${record.competitor}-${record.sourceUrl}`}>
                  <strong>{record.competitor} · {record.platform}</strong>
                  <p>{record.headline}</p>
                  <span className="method-note">{record.status}</span>
                  <SourceLink href={record.sourceUrl}>ad library source</SourceLink>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="playbook-section" id="content-topics">
          <span className="anchor-target" id="content-seo" />
          <div className="cardhead">
            <div>
              <h2>Content topics and reply angles</h2>
              <p className="section-subtitle">Market-specific topics from Signals, review themes, zones, and creator evidence.</p>
            </div>
            <ProvenanceChip provenance={dossier.contentTopics.length ? "derived" : "connector-needed"} />
          </div>
          {dossier.contentTopics.length ? (
            <div className="content-topic-grid">
              {dossier.contentTopics.map((topic) => (
                <article className="content-topic-card" key={topic.id}>
                  <div className="ad-meta-row">
                    <h3>{topic.topic}</h3>
                    <span className="claim-contract-chip">{topic.ownerChannel}</span>
                  </div>
                  <dl>
                    <div>
                      <dt>Source evidence</dt>
                      <dd>{topic.sourceEvidence}</dd>
                    </div>
                    <div>
                      <dt>Reply angle</dt>
                      <dd>{topic.replyAngle}</dd>
                    </div>
                    <div>
                      <dt>Copy-ready asset</dt>
                      <dd>{topic.copyReadyAsset}</dd>
                    </div>
                    <div>
                      <dt>Next experiment</dt>
                      <dd>{topic.nextExperiment}</dd>
                    </div>
                  </dl>
                  <p className="not-prove-line">{topic.boundary}</p>
                  <div className="source-row">
                    {topic.sourceLinks.map((link) => (
                      <SourceLink href={link.href} key={`${topic.id}-${link.href}`}>
                        {link.label}
                      </SourceLink>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="connector-state signal-connector">
              <p>Content topics need Signals evidence before this section can render.</p>
            </div>
          )}
        </section>

        <section className="playbook-section" id="offline-surfaces">
          <div className="cardhead">
            <div>
              <h2>Offline surfaces</h2>
              <p className="section-subtitle">Named community places become test surfaces only when evidence exists.</p>
            </div>
            <ProvenanceChip provenance={dossier.offlineSurfaces.coverageNote ? "connector-needed" : "snapshot"} />
          </div>
          {dossier.offlineSurfaces.coverageNote ? (
            <div className="connector-state signal-connector">
              <p>{dossier.offlineSurfaces.coverageNote}</p>
            </div>
          ) : (
            <div className="offline-grid">
              {dossier.offlineSurfaces.recommendations.map((recommendation) => (
                <article className="offline-card" key={recommendation.title}>
                  <h3>{recommendation.title}</h3>
                  <p>{recommendation.setup}</p>
                  <details className="surface-details">
                    <summary>How to activate</summary>
                    <dl>
                      <div>
                        <dt>Activation idea</dt>
                        <dd>{recommendation.howTo.activationIdea}</dd>
                      </div>
                      <div>
                        <dt>Asset needed</dt>
                        <dd>{recommendation.howTo.assetNeeded}</dd>
                      </div>
                      <div>
                        <dt>How to measure</dt>
                        <dd>{recommendation.howTo.howToMeasure}</dd>
                      </div>
                      <div>
                        <dt>Honesty boundary</dt>
                        <dd>{recommendation.howTo.boundary}</dd>
                      </div>
                    </dl>
                  </details>
                  <div className="source-row">
                    {recommendation.evidenceLinks.map((link) => (
                      <SourceLink href={link.href} key={link.href}>
                        {link.label}
                      </SourceLink>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="playbook-section" id="referral-amplification">
          <div className="cardhead">
            <div>
              <h2>{dossier.referralPlay.title}</h2>
              <p className="section-subtitle">Offline surfaces as referral-activation moments.</p>
            </div>
            <ProvenanceChip provenance="derived" />
          </div>
          <p>{dossier.referralPlay.body}</p>
          <code className="schema-box">{dossier.referralPlay.measurementPath}</code>
          <div className="source-row">
            {dossier.referralPlay.evidenceLinks.map((link) => (
              <SourceLink href={link.href} key={`${link.href}-${link.label}`}>
                {link.label}
              </SourceLink>
            ))}
          </div>
        </section>

        <section className="playbook-section" id="experiment-plan">
          <span className="anchor-target" id="messaging" />
          <div className="cardhead">
            <div>
              <h2>Experiment plan</h2>
              <p className="section-subtitle">Generated from persona and channel fit, then claim-checked.</p>
            </div>
            <ProvenanceChip provenance="derived" />
          </div>
          <div className="experiment-grid">
            {dossier.experiments.map((experiment) => (
              <article className="experiment-card" key={`${experiment.personaName}-${experiment.channelName}`}>
                <div className="ad-meta-row">
                  <h3>{experiment.channelName}</h3>
                  {experiment.tag ? <span className="tag-chip">{experiment.tag}</span> : null}
                </div>
                <p>{experiment.hypothesis}</p>
                <dl className="experiment-meta-grid">
                  <div>
                    <dt>Setup</dt>
                    <dd>{experiment.setup}</dd>
                  </div>
                  <div>
                    <dt>Primary metric</dt>
                    <dd>{experiment.primaryMetric}</dd>
                  </div>
                  <div>
                    <dt>Budget band</dt>
                    <dd>{experiment.budgetBand}</dd>
                  </div>
                  <div>
                    <dt>Success threshold</dt>
                    <dd>{experiment.successThreshold}</dd>
                  </div>
                  <div>
                    <dt>Kill criterion</dt>
                    <dd>{experiment.killCriterion}</dd>
                  </div>
                </dl>
                <p className="not-prove-line">{experiment.doesNotProve}</p>
                <div className="source-row">
                  {experiment.sourceLinks.map((link) => (
                    <SourceLink href={link.href} key={`${experiment.channelName}-${link.href}`}>
                      {link.label}
                    </SourceLink>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="playbook-section" id="creative-angles">
          <div className="cardhead">
            <div>
              <h2>Creative angles</h2>
              <p className="section-subtitle">Filtered to personas scoring medium or higher for this market.</p>
            </div>
            <ProvenanceChip provenance="derived" />
          </div>
          <div className="creative-grid">
            {dossier.creativeAngles.map((angle) => (
              <details className="creative-card" key={angle.id}>
                <summary>
                  <span>{angle.headline}</span>
                  <small>{angle.format}</small>
                </summary>
                <dl>
                  <div>
                    <dt>Primary copy</dt>
                    <dd>{angle.primaryCopy}</dd>
                  </div>
                  <div>
                    <dt>Funnel stage</dt>
                    <dd>{angle.funnelStage}</dd>
                  </div>
                  <div>
                    <dt>Targeting recipe</dt>
                    <dd>{angle.targetingRecipe}</dd>
                  </div>
                  <div>
                    <dt>Why this angle</dt>
                    <dd>{angle.whyItWorks}</dd>
                  </div>
                  <div>
                    <dt>Risk</dt>
                    <dd>{angle.risk}</dd>
                  </div>
                  <div>
                    <dt>CTA</dt>
                    <dd>{angle.cta}</dd>
                  </div>
                  <div>
                    <dt>Measurement goal</dt>
                    <dd>{angle.measurementGoal}</dd>
                  </div>
                </dl>
                <SourceLink href={angle.groundingSignal.href}>{angle.groundingSignal.label}</SourceLink>
              </details>
            ))}
          </div>
        </section>

        <section className="playbook-section" id="rate-timing">
          <div className="cardhead">
            <div>
              <h2>Rate timing and calendar</h2>
              <p className="section-subtitle">Historical USD/INR context and the next planning moments.</p>
            </div>
            <ProvenanceChip provenance={dossier.fxHistory ? "grounded" : "connector-needed"} />
          </div>
          <RateTimingChart fxHistory={dossier.fxHistory} />
          <div className="seasonal-list">
            {dossier.seasonalMoments.map((moment) => (
              <article className="offline-card" key={moment.id}>
                <h3>{moment.name}</h3>
                <p>{formatDate(moment.start)} to {formatDate(moment.end)}</p>
                <p>{moment.play}</p>
                <p className="method-note">{moment.sourceNote}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="playbook-section" id="measurement-spec">
          <span className="anchor-target" id="proof" />
          <div className="cardhead">
            <div>
              <h2>Measurement spec</h2>
              <p className="section-subtitle">{dossier.measurementSpec.schemaName}</p>
            </div>
            <ProvenanceChip provenance="connector-needed" />
          </div>
          <code className="schema-box">{dossier.measurementSpec.utmConvention}</code>
          <ul className="event-list">
            {dossier.measurementSpec.events.map((event) => (
              <li key={event}>{event}</li>
            ))}
          </ul>
          <MeasurementProofGate market={market} markets={dossier.marketsForProofGate} />
        </section>

        <section className="playbook-section" id="what-we-need-from-xpat">
          <div className="cardhead">
            <div>
              <h2>What we need from Xpat</h2>
              <p className="section-subtitle">Owned exports that unlock proof beyond public hypotheses.</p>
            </div>
            <ProvenanceChip provenance="connector-needed" />
          </div>
          <div className="xpat-needs-grid">
            {dossier.xpatNeeds.map((need) => (
              <article className="offline-card" key={need.schema}>
                <h3>{need.schema}</h3>
                <p>{need.decisionUnlocked}</p>
                <p className="method-note">{need.fieldsText}</p>
                <ul className="why-list">
                  {need.fields.map((field) => (
                    <li key={field}>{field}</li>
                  ))}
                </ul>
                <p>{need.csvAlternative}</p>
                <span className="claim-contract-chip">CONNECTOR NEEDED</span>
              </article>
            ))}
          </div>
          <span className="claim-contract-chip">Claim contract active</span>
        </section>

        <section className="playbook-section pilot-panel" id="from-evidence-to-proof">
          <div className="cardhead">
            <div>
              <h2>From evidence to proof</h2>
              <p className="section-subtitle">Public evidence becomes decisions only after owned exports.</p>
            </div>
            <ProvenanceChip provenance="connector-needed" />
          </div>
          <p>
            Everything above is public-data evidence: where the audience is, who competes for it, and what to test. Proving what works needs one thing only Xpat has: owned campaign and funnel exports. A 30 to 90 day market test in one Tier 1 market, measured through the schema on this page, turns this playbook from hypotheses into decisions. The data ask is listed above. No system access is required to start; exported CSVs are enough.
          </p>
          <CopyDataAskButton needs={dossier.xpatNeeds} />
        </section>
      </div>
    </section>
  );
}
