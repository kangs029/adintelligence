import { Lightbulb, Link2Off } from "lucide-react";
import { ProvenanceChip } from "@/components/shell/ProvenanceChip";
import { SourceLink } from "@/components/shell/SourceLink";
import { PlaybookHandoffLink } from "./PlaybookHandoffLink";
import type { CommunityThreadsArtifact, CommunityThread } from "./CommunityThreads";
import type { CreatorsArtifact } from "./CreatorGrid";
import type { GeoVisibilityArtifact } from "./GeoVisibility";
import type { ReviewPainRollupArtifact } from "./ReviewPainRollup";
import type { SwitchMomentsArtifact } from "./SwitchMoments";
import type { PlaybookHandoffAnchor } from "@/lib/playbook/handoff";

interface ContentTopicsProps {
  creators: CreatorsArtifact;
  geoVisibility: GeoVisibilityArtifact;
  reviewThemes: ReviewPainRollupArtifact;
  switchMoments: SwitchMomentsArtifact;
  threads: CommunityThreadsArtifact;
}

type ContentTopic = {
  actionAnchor: PlaybookHandoffAnchor;
  actionLabel: string;
  angle: string;
  caveat: string;
  evidence: string;
  id: string;
  sourceHref?: string;
  sourceLabel: string;
  sourceState?: "capture pending" | "source unavailable";
  tags: string[];
  title: string;
};

function formatDate(value?: string | null) {
  if (!value) return "undated";
  return value.slice(0, 10);
}

function clip(value: string, limit = 180) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1).trim()}...`;
}

function priorityRank(thread: CommunityThread) {
  if (thread.priority === "high") return 0;
  if (thread.priority === "medium") return 1;
  if (thread.priority === "low") return 2;
  return 3;
}

function topThreadTopic(artifact: CommunityThreadsArtifact): ContentTopic | null {
  const thread = [...artifact.data.threads].sort((left, right) => {
    const rankOrder = priorityRank(left) - priorityRank(right);
    const recencyOrder = left.recency === right.recency ? 0 : left.recency === "recent" ? -1 : 1;
    const dateOrder = (right.publishedAt ?? "").localeCompare(left.publishedAt ?? "");
    return rankOrder || recencyOrder || dateOrder || left.title.localeCompare(right.title);
  })[0];

  if (!thread) return null;

  return {
    actionAnchor: "community",
    actionLabel: "Draft a reply angle in Playbook",
    angle:
      thread.responseAngle ??
      "Use the thread question as a content prompt, then review the source before posting.",
    caveat: "Use as observed community language. It is not proof of launch demand.",
    evidence: `${thread.title}, r/${thread.subreddit}, captured ${formatDate(thread.capturedAt)}.`,
    id: `thread-${thread.id}`,
    sourceHref: thread.url,
    sourceLabel: "thread source",
    tags: thread.themes.slice(0, 3),
    title: `Community reply: ${thread.title}`,
  };
}

function topReviewThemeTopic(artifact: ReviewPainRollupArtifact): ContentTopic | null {
  const corpusSize = artifact.data.groups.reduce((sum, group) => sum + group.sampleSize, 0);
  const totals = new Map<string, { count: number; example?: { date: string; store: "ios" | "android"; text: string } }>();

  for (const group of artifact.data.groups) {
    for (const theme of group.themes) {
      const existing = totals.get(theme.theme) ?? { count: 0 };
      existing.count += theme.count;
      existing.example ??= theme.examples[0];
      totals.set(theme.theme, existing);
    }
  }

  const [theme, row] = [...totals.entries()].sort(
    (left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]),
  )[0] ?? [];

  if (!theme || !row) return null;

  const example = row.example
    ? ` Sample ${row.example.store === "ios" ? "iOS" : "Android"} excerpt from ${formatDate(row.example.date)}: ${clip(row.example.text, 120)}`
    : "";

  return {
    actionAnchor: "messaging",
    actionLabel: "Use as messaging angle",
    angle: `Build a reassurance post or FAQ around ${theme.toLowerCase()} concerns in public app reviews.`,
    caveat: "Review themes show complaint frequency in the mined corpus, not product outcomes.",
    evidence: `${row.count.toLocaleString("en-US")} ${theme.toLowerCase()} matches across ${corpusSize.toLocaleString("en-US")} public review excerpts.${example}`,
    id: `review-${theme}`,
    sourceLabel: "source unavailable",
    sourceState: "source unavailable",
    tags: [theme, "review pain"],
    title: `Review angle: ${theme}`,
  };
}

function switchMomentTopic(artifact: SwitchMomentsArtifact): ContentTopic | null {
  const moment = artifact.data.moments[0];
  if (!moment) return null;

  return {
    actionAnchor: "messaging",
    actionLabel: "Use as messaging angle",
    angle: `Draft a switcher reassurance angle around the exact rule match: ${moment.matchedPattern}.`,
    caveat: "Presence evidence only. This does not prove someone moved to Xpat.",
    evidence: `${moment.provider} ${moment.store === "ios" ? "iOS" : "Android"} review, ${formatDate(moment.reviewDate)}: ${clip(moment.excerpt, 140)}`,
    id: `switch-${moment.id}`,
    sourceLabel: "source unavailable",
    sourceState: "source unavailable",
    tags: [moment.provider, moment.theme],
    title: "Warm switching moment",
  };
}

function creatorTopic(artifact: CreatorsArtifact): ContentTopic | null {
  const creator = artifact.data.creators
    .filter((candidate) => "group" in candidate && candidate.group === "evidence-linked" && candidate.currentSponsor)
    .sort((left, right) => ("rank" in left && "rank" in right ? left.rank - right.rank : 0))[0];

  if (!creator || !("group" in creator)) return null;

  return {
    actionAnchor: "channels",
    actionLabel: "See creator play",
    angle: `Use ${creator.audienceLang} as the language cue for a creator brief, then verify the source before outreach.`,
    caveat: "Observed sponsor context does not imply price, reach, or outcome data.",
    evidence: `${creator.handle} has observed ${creator.currentSponsor ?? "sponsor"} context. ${clip(creator.evidence, 140)}`,
    id: `creator-${creator.id}`,
    sourceHref: creator.link,
    sourceLabel: "proof link",
    tags: [creator.currentSponsor ?? "sponsor observed", creator.platform],
    title: "Creator brief cue",
  };
}

function geoTopic(artifact: GeoVisibilityArtifact): ContentTopic | null {
  if (artifact.data.queries.length === 0 || artifact.data.assistants.length === 0) return null;

  if (artifact.data.capturedAnswers === 0) {
    return {
      actionAnchor: "content-seo",
      actionLabel: "Use capture checklist",
      angle: "Use the configured query list as the capture checklist before writing AI visibility content.",
      caveat: "Pending cells mean no answer screenshot was captured. Do not infer absence.",
      evidence: `${artifact.data.queries.length.toLocaleString("en-US")} queries across ${artifact.data.assistants.length.toLocaleString("en-US")} assistants are pending manual capture.`,
      id: "geo-pending",
      sourceLabel: "capture pending",
      sourceState: "capture pending",
      tags: ["AI visibility", "manual capture"],
      title: "AI answer benchmark setup",
    };
  }

  return {
    actionAnchor: "content-seo",
    actionLabel: "Use capture checklist",
    angle: "Compare captured provider mentions against Xpat presence before drafting search or AI-answer content.",
    caveat: "Assistant answers are dated snapshots, not stable rankings.",
    evidence: `${artifact.data.capturedAnswers.toLocaleString("en-US")} captured answers across ${artifact.data.queries.length.toLocaleString("en-US")} configured queries.`,
    id: "geo-captured",
    sourceLabel: "source unavailable",
    sourceState: "source unavailable",
    tags: ["AI visibility", "dated snapshot"],
    title: "AI answer visibility angle",
  };
}

function contentTopics(props: ContentTopicsProps) {
  return [
    topThreadTopic(props.threads),
    topReviewThemeTopic(props.reviewThemes),
    switchMomentTopic(props.switchMoments),
    creatorTopic(props.creators),
    geoTopic(props.geoVisibility),
  ].filter((topic): topic is ContentTopic => Boolean(topic));
}

function TopicSource({ topic }: { topic: ContentTopic }) {
  if (topic.sourceHref) {
    return <SourceLink href={topic.sourceHref}>{topic.sourceLabel}</SourceLink>;
  }

  return (
    <span className="source-missing">
      <Link2Off size={12} aria-hidden="true" />
      {topic.sourceState ?? "source unavailable"}
    </span>
  );
}

export function ContentTopics(props: ContentTopicsProps) {
  const topics = contentTopics(props);

  return (
    <section className="evidence-section" aria-labelledby="content-topics-title">
      <div className="cardhead">
        <div>
          <h2 id="content-topics-title">Content topics and reply angles</h2>
          <p className="section-subtitle">
            Evidence-backed prompts for content, creator, and community work. Human review still happens before publishing.
          </p>
        </div>
        <ProvenanceChip provenance="derived" />
      </div>

      <div className="content-topic-grid">
        {topics.map((topic) => (
          <article className="content-topic-card" key={topic.id}>
            <div className="content-topic-heading">
              <Lightbulb size={15} aria-hidden="true" />
              <h3>{topic.title}</h3>
            </div>
            <p className="content-topic-angle">{topic.angle}</p>
            <p className="content-topic-evidence">
              <strong>Evidence:</strong> {topic.evidence}
            </p>
            <p className="content-topic-caveat">
              <strong>Caveat:</strong> {topic.caveat}
            </p>
            <div className="tag-row">
              {topic.tags.map((tag) => (
                <span className="tag-pill" key={`${topic.id}-${tag}`}>
                  {tag}
                </span>
              ))}
            </div>
            <div className="signal-action-row">
              <TopicSource topic={topic} />
              <PlaybookHandoffLink anchor={topic.actionAnchor} className="action-link">
                {topic.actionLabel}
              </PlaybookHandoffLink>
            </div>
          </article>
        ))}
      </div>

      <p className="boundary-line">
        These are content prompts from public evidence. They are not launch forecasts or product outcome claims.
      </p>
    </section>
  );
}
