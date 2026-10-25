import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { generateText } from "ai";

import { findCopyViolations } from "./check-copy.mjs";
import { buildBriefGrounding, computeSourceHash } from "@/lib/ai/brief-grounding";
import { BRIEF_MODEL } from "@/lib/ai/config";
import { buildBriefSystemPrompt, buildBriefUserPrompt } from "@/lib/ai/brief-prompt";
import { sanitizeBrief } from "@/lib/ai/brief-sanitizer";
import { validateClaims } from "@/lib/claims/contract";
import { buildDossierForGeoid } from "@/lib/playbook/dossier-inputs";

const PINNED_GEOIDS = [
  "31000US41940",
  "31000US19100",
  "31000US19820",
  "31000US26900",
];

type BriefEntry = {
  marketName: string;
  sourceHash: string;
  generatedAt: string;
  text: string;
};

async function generateOne(geoid: string): Promise<BriefEntry> {
  const dossier = buildDossierForGeoid(geoid);
  if (!dossier) {
    throw new Error(`Unknown market geoid: ${geoid}`);
  }

  const facts = buildBriefGrounding(dossier);
  const sourceHash = computeSourceHash(facts);
  const marketName = dossier.market.name;

  const { text } = await generateText({
    model: BRIEF_MODEL,
    system: buildBriefSystemPrompt(),
    prompt: buildBriefUserPrompt(marketName, facts),
  });

  const sanitized = sanitizeBrief(text);
  const copyViolations = findCopyViolations(sanitized.text, "brief.json") as unknown[];
  const claimViolations = validateClaims({ text: sanitized.text }, "copy");

  if (copyViolations.length > 0 || claimViolations.length > 0) {
    console.error("copy violations:", JSON.stringify(copyViolations, null, 2));
    console.error("claim violations:", JSON.stringify(claimViolations, null, 2));
    throw new Error(`Brief for ${marketName} failed the claim contract after sanitize.`);
  }

  console.log(
    `Generated ${marketName} (${geoid}): ${sanitized.text.length} chars, ${sanitized.redactions.length} redactions, hash ${sourceHash}`,
  );

  return {
    marketName,
    sourceHash,
    generatedAt: new Date().toISOString(),
    text: sanitized.text,
  };
}

async function main() {
  const briefs: Record<string, BriefEntry> = {};

  for (const geoid of PINNED_GEOIDS) {
    briefs[geoid] = await generateOne(geoid);
  }

  const generatedAt = new Date().toISOString();
  const envelope = {
    meta: {
      family: "market-brief",
      provenance: "generated",
      model: BRIEF_MODEL,
      generatedAt,
      source: "data/artifacts grounding facts via lib/ai/brief-grounding.ts",
      method:
        "Streamed brief written by openai/gpt-5-mini from committed dossier grounding facts, then sanitized against the claim contract in code.",
      refreshCadence: "regenerated when the playbook dossier artifacts change",
      caveats: [
        "Generated narrative. Every claim is grounded in committed public-data facts and stated as a hypothesis, never proven campaign performance.",
        "Outcome measurement is connector-needed. It requires the Xpat export schema before any funnel outcome is proven.",
      ],
      version: "1",
    },
    data: { briefs },
  };

  const target = join(process.cwd(), "data/artifacts/market-briefs.json");
  await writeFile(target, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  console.log(`Wrote ${Object.keys(briefs).length} briefs to ${target}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
