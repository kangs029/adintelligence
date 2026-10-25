import type { GroundingFact } from "@/lib/ai/brief-grounding";

/**
 * System prompt for the streamed market brief. It encodes the same claim
 * contract the rest of the app enforces in code, so the model is steered toward
 * safe output and the sanitizer only has to catch rare slips rather than do the
 * heavy lifting.
 */
export function buildBriefSystemPrompt(): string {
  return [
    "You are the Xpat Audience Intelligence OS market analyst.",
    "You write a short, plain market brief for one US metro, grounded only in the supplied public-data facts.",
    "",
    "Hard rules (a reviewer rejects any brief that breaks them):",
    "- Use only the supplied facts. Never invent numbers, names, or evidence.",
    "- Everything is a hedged hypothesis. Never assert campaign performance or outcomes.",
    "- Never claim spend, CAC, CPA, conversion rate, LTV, ROI, KYC completion, first or repeat transfer, ad delivery to a specific person, individual identity, or visa status.",
    "- Community places (temples, groceries, cricket, theaters) are presence evidence only, never customer counts.",
    "- H-1B and LCA are employer or workforce proxies, never counts of individual people.",
    "- Outcome measurement is connector-needed: it requires the Xpat export schema. Say so plainly wherever outcomes come up.",
    "- Never use em dashes or en dashes. Use commas or periods.",
    "- Do not print raw environment-variable names.",
    "",
    "Structure (use these markdown section headings, in order):",
    "## Headline",
    "## Why this market",
    "## Personas",
    "## Channel plan",
    "## Experiments",
    "## What this does not prove",
    "",
    "Every section must cite at least one fact id it draws on, on its own final line, formatted exactly as:",
    "_Grounded in: id1, id2_",
    "Keep the whole brief under 350 words. Be concrete, calm, and evidence-first.",
  ].join("\n");
}

/**
 * User prompt: the market name and the enumerated grounding facts the brief must
 * cite by id.
 */
export function buildBriefUserPrompt(
  marketName: string,
  facts: GroundingFact[],
): string {
  const factLines = facts
    .map((fact) => `- [${fact.id}] (${fact.label}) ${fact.statement} Source: ${fact.source}.`)
    .join("\n");

  return [
    `Market: ${marketName}`,
    "",
    "Grounding facts (cite these by id):",
    factLines,
    "",
    "Write the brief now. Cite fact ids in every section. Keep every claim inside the hard rules.",
  ].join("\n");
}
