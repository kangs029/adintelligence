import { Plug } from "lucide-react";
import { ProvenanceChip, type Provenance } from "@/components/shell/ProvenanceChip";
import { SourceLink } from "@/components/shell/SourceLink";
import { PlaybookHandoffLink } from "./PlaybookHandoffLink";

type DisplayCreator = {
  audienceLang: string;
  capturedAt: string;
  currentSponsor: string | null;
  evidence: string;
  fitNote: string;
  fitScore: number;
  followerTier: string;
  group: "evidence-linked" | "leads-to-verify";
  handle: string;
  id: string;
  link: string;
  platform: string;
  rank: number;
  recencyLabel: string;
};

type LiveCreator = {
  audienceFitNote: string;
  capturedAt: string;
  channelId: string;
  name: string;
  recentRelevantVideos: { publishedAt: string; title: string; url: string; views: number }[];
  subscriberCount: number;
  url: string;
};

type Creator = DisplayCreator | LiveCreator;

export type CreatorsArtifact = {
  data: {
    connectorNote?: { label: string; status: "connector-needed" };
    creators: Creator[];
    evidenceLinkedCount?: number;
    leadsToVerifyCount?: number;
    status: "ok" | "connector-needed";
    sweepErrors: { message: string }[];
  };
  meta: {
    generatedAt: string;
    provenance: Provenance;
  };
};

interface CreatorGridProps {
  artifact: CreatorsArtifact;
}

const youtubeApiKey = ["YOUTUBE", "API", "KEY"].join("_");

function formatDate(value: string) {
  return value.slice(0, 10);
}

function readableYoutubeError(message: string) {
  return message.replaceAll(youtubeApiKey, "YouTube API access");
}

function groupedCreators(creators: Creator[]) {
  const displayCreators = creators.map(normalizeCreatorForDisplay);

  return [
    {
      description: "Dated proof link present.",
      group: "evidence-linked" as const,
      title: "Evidence-linked creators",
    },
    {
      description: "Older profile-only leads that still need a fresh proof link.",
      group: "leads-to-verify" as const,
      title: "Leads to verify",
    },
  ].map((group) => ({
    ...group,
    creators: displayCreators
      .filter((creator) => creator.group === group.group)
      .sort((left, right) => left.rank - right.rank),
  }));
}

function isDisplayCreator(creator: Creator): creator is DisplayCreator {
  return "group" in creator;
}

function subscriberTier(count: number) {
  if (!Number.isFinite(count) || count <= 0) return "Subscriber count unavailable";
  return `${count.toLocaleString("en-US")} subscribers`;
}

function normalizeCreatorForDisplay(creator: Creator, index: number): DisplayCreator {
  if (isDisplayCreator(creator)) return creator;

  const latestVideo = creator.recentRelevantVideos[0];

  return {
    audienceLang: "Needs curated language review",
    capturedAt: creator.capturedAt,
    currentSponsor: null,
    evidence: latestVideo
      ? `Recent YouTube API video: ${latestVideo.title}`
      : "YouTube API channel row. Inspect before outreach.",
    fitNote: creator.audienceFitNote,
    fitScore: 0,
    followerTier: subscriberTier(creator.subscriberCount),
    group: "leads-to-verify",
    handle: creator.name,
    id: creator.channelId,
    link: creator.url,
    platform: "youtube",
    rank: index + 1,
    recencyLabel: "live API snapshot",
  };
}

function sponsorLabel(sponsor: string | null) {
  return sponsor ?? "No sponsor observed";
}

function creatorSourceLabel(creator: DisplayCreator) {
  return creator.group === "evidence-linked" ? "proof link" : "profile source";
}

function CreatorCard({ creator }: { creator: DisplayCreator }) {
  const hasSponsor = Boolean(creator.currentSponsor);

  return (
    <article className="creator-card">
      <div className="ad-meta-row">
        <div>
          <h3>{creator.handle}</h3>
          <p className="creator-platform">{creator.platform}</p>
        </div>
        <ProvenanceChip date={formatDate(creator.capturedAt)} provenance="snapshot" />
      </div>

      <div className="creator-sponsor-row">
        <span className={hasSponsor ? "sponsor-chip sponsor-chip-active" : "sponsor-chip"}>
          {sponsorLabel(creator.currentSponsor)}
        </span>
        <span className="tag-pill">{creator.followerTier}</span>
      </div>

      <dl className="creator-facts">
        <div>
          <dt>Languages</dt>
          <dd>{creator.audienceLang}</dd>
        </div>
        <div>
          <dt>Fit note</dt>
          <dd>{creator.fitNote}</dd>
        </div>
      </dl>

      <p className="evidence-line">{creator.evidence}</p>

      <div className="signal-action-row">
        <SourceLink href={creator.link}>{creatorSourceLabel(creator)}</SourceLink>
        <PlaybookHandoffLink anchor="channels" className="action-link">
          See creator play
        </PlaybookHandoffLink>
      </div>
    </article>
  );
}

export function CreatorGrid({ artifact }: CreatorGridProps) {
  const creators = artifact.data.creators;
  const connectorNeeded = artifact.data.status !== "ok" || creators.length === 0;
  const groups = groupedCreators(creators);

  return (
    <section className="evidence-section" id="creators" aria-labelledby="creators-title">
      <div className="cardhead">
        <div>
          <h2 id="creators-title">Creators</h2>
          <p className="section-subtitle">
            Creators with diaspora or corridor-adjacent evidence. Public rows show overlap, not precise audience location.
          </p>
        </div>
        <ProvenanceChip
          date={formatDate(artifact.meta.generatedAt)}
          provenance={artifact.meta.provenance}
        />
      </div>

      {connectorNeeded ? (
        <div className="connector-state signal-connector">
          <div className="connector-title">
            <Plug size={16} aria-hidden="true" />
            <h3>Needs YouTube API access</h3>
          </div>
          {artifact.data.sweepErrors.map((error) => (
            <p key={error.message}>{readableYoutubeError(error.message)}</p>
          ))}
          <p className="connector-unlock">
            Unlocks creator cards with public channels, recent videos, and
            human-reviewed audience-fit notes.
          </p>
          <details className="setup-details">
            <summary>setup details</summary>
            <code className="schema-box" data-copy-code>
              {youtubeApiKey}
            </code>
          </details>
        </div>
      ) : (
        <>
          <div className="inline-connector-strip">
            <Plug size={14} aria-hidden="true" />
            <span>{artifact.data.connectorNote?.label ?? "YouTube API access makes this live-refreshable"}</span>
          </div>

          {groups.map((group) => (
            <section className="creator-group" key={group.group} aria-label={group.title}>
              <div className="thread-column-head">
                <div>
                  <h3>{group.title}</h3>
                  <p className="section-subtitle">{group.description}</p>
                </div>
                <span>{group.creators.length.toLocaleString("en-US")}</span>
              </div>
              <div className="creator-grid">
                {group.creators.map((creator) => (
                  <CreatorCard creator={creator} key={creator.id} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      <p className="boundary-line">
        Public channels with audience overlap. No outreach has occurred, no pricing is implied.
      </p>
    </section>
  );
}
