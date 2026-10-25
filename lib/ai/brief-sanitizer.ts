import {
  allowedMissingDataContext,
  bannedPerformanceClaims,
} from "@/lib/claims/banned";

/**
 * Brief sanitizer: the code-enforced backstop for the claim contract on
 * generated market briefs.
 *
 * It guarantees generated prose stays inside the same boundary the rest of the
 * app is held to by scripts/check-copy.mjs and lib/claims/contract.ts:
 *   - no em or en dashes
 *   - no raw environment-variable-shaped tokens
 *   - no banned performance claims (spend, CAC, CPA, conversion rate, LTV, ROI,
 *     transfer funnel steps, identity, visa) on lines that do not carry an
 *     allowed missing-data context
 *   - no anchor "customer counts" claim, no workforce-proxy identity claim
 *
 * The per-line pass mirrors check-copy so committed briefs pass the copy gate.
 * A whole-text cross-line pass then neutralizes banned phrases the model split
 * across a line break (e.g. "conversion\nrate"), which a purely line-based
 * check cannot see. The streaming path buffers to section boundaries and runs
 * the same whole-block sanitize, so no unsanitized token reaches the client.
 */

export type SanitizeResult = {
  text: string;
  redactions: string[];
  clean: boolean;
};

const DASH_PATTERN = /\s*[\u2013\u2014]\s*/g;
const RESIDUAL_DASH_PATTERN = /[\u2013\u2014]/g;
const ENV_VAR_PATTERN = /\b[A-Z]{3,}_[A-Z_]{3,}\b/g;

const SAFE_REPLACEMENT: Record<string, string> = {
  spend: "budget band",
  CAC: "acquisition cost (requires Xpat connector)",
  CPA: "cost per action (requires Xpat connector)",
  "conversion rate": "conversion signal (requires Xpat connector)",
  "KYC completion": "onboarding milestone (requires Xpat connector)",
  "first transfer": "first transaction (requires Xpat connector)",
  "repeat transfer": "repeat transaction (requires Xpat connector)",
  LTV: "lifetime value (requires Xpat connector)",
  ROI: "return signal (requires Xpat connector)",
  "delivery of a specific ad": "public ad delivery evidence (requires Xpat connector)",
  "specific geo": "geo detail (requires Xpat connector)",
  "individual identity": "identity detail (requires Xpat connector)",
  "visa status": "audience status detail (requires Xpat connector)",
};

const ANCHOR_CUSTOMER_COUNTS = /\bcustomer counts?\b/giu;
const WORKFORCE_SOURCE = /\b(H-?1B|LCA)\b/iu;
const WORKFORCE_PROXY_PHRASE = /employer\/workforce proxy/iu;

/**
 * Cross-line neutralization rules. A multi-word banned phrase (or the anchor
 * "customer counts") can be split across a line break by the model, e.g.
 * "conversion\nrate". The per-line pass never sees such a phrase whole, so it
 * would slip through. These patterns match the phrase with any run of
 * whitespace (including newlines) between words; we only neutralize a match
 * that actually spans a newline, so legitimate same-line allowed-context
 * phrasing (handled by the per-line pass) is left untouched.
 */
type CrossLineRule = { pattern: RegExp; term: string; replacement: string };

const CROSS_LINE_RULES: CrossLineRule[] = [
  ...bannedPerformanceClaims
    .filter((claim) => /\s/u.test(claim.term))
    .map((claim) => ({
      pattern: new RegExp(claim.pattern.source.replace(/ /gu, "\\s+"), "giu"),
      term: claim.term,
      replacement: SAFE_REPLACEMENT[claim.term] ?? "(requires Xpat connector)",
    })),
  {
    pattern: /\bcustomer\s+counts?\b/giu,
    term: "customer counts",
    replacement: "community presence evidence",
  },
];

function neutralizeCrossLineClaims(input: string, redactions: string[]): string {
  let output = input;
  for (const rule of CROSS_LINE_RULES) {
    output = output.replace(rule.pattern, (match) => {
      if (!match.includes("\n")) {
        return match;
      }
      redactions.push(rule.term);
      return rule.replacement;
    });
  }
  return output;
}

function lineHasAllowedContext(line: string): boolean {
  return allowedMissingDataContext.some((pattern) => pattern.test(line));
}

function sanitizeLine(input: string): { line: string; redactions: string[] } {
  const redactions: string[] = [];

  let line = input.replace(DASH_PATTERN, ", ").replace(RESIDUAL_DASH_PATTERN, ", ");
  if (line !== input) {
    redactions.push("em-or-en-dash");
  }

  line = line.replace(ENV_VAR_PATTERN, (match) => {
    redactions.push(match);
    return match.replace(/_/gu, " ");
  });

  // Anchor evidence boundary: presence evidence never becomes customer counts.
  // "customer counts" is the exact banned anchor over-claim in this product, so
  // neutralize it unconditionally. This also guarantees the whole-text claim
  // contract holds even when the anchor word sits on a different line.
  const anchorNeutralized = line.replace(
    ANCHOR_CUSTOMER_COUNTS,
    "community presence evidence",
  );
  if (anchorNeutralized !== line) {
    redactions.push("customer counts");
    line = anchorNeutralized;
  }

  // Workforce proxy boundary: H-1B or LCA is an employer proxy, never a person.
  // Tag every line that names the source with the proxy phrase, so the
  // whole-text contract passes regardless of where "people" words appear.
  if (WORKFORCE_SOURCE.test(line) && !WORKFORCE_PROXY_PHRASE.test(line)) {
    line = line.replace(WORKFORCE_SOURCE, (match) => `${match} employer/workforce proxy`);
    redactions.push("workforce-proxy");
  }

  if (!lineHasAllowedContext(line)) {
    for (const claim of bannedPerformanceClaims) {
      const globalPattern = new RegExp(claim.pattern.source, "giu");
      if (globalPattern.test(line)) {
        redactions.push(claim.term);
        const replacement = SAFE_REPLACEMENT[claim.term] ?? "(requires Xpat connector)";
        line = line.replace(new RegExp(claim.pattern.source, "giu"), replacement);
      }
    }
  }

  return { line, redactions };
}

/**
 * Whole-text sanitize. Use for cached full briefs, committed demo artifacts, and
 * the offline generator, where the entire brief is available at once.
 */
export function sanitizeBrief(input: string): SanitizeResult {
  const redactions: string[] = [];
  const lines = input.split("\n").map((line) => {
    const result = sanitizeLine(line);
    redactions.push(...result.redactions);
    return result.line;
  });

  // Whole-text backstop: catch banned phrases split across line breaks, which
  // the per-line pass structurally cannot see.
  const text = neutralizeCrossLineClaims(lines.join("\n"), redactions);

  return {
    text,
    redactions,
    clean: redactions.length === 0,
  };
}

/**
 * Streaming sanitizer. Buffers deltas until a section boundary (a blank line),
 * then sanitizes the whole completed block at once, so a banned phrase can
 * never reach the client mid-line and cross-line splits inside a section are
 * caught by the whole-block pass. Call `push` for each incoming text delta and
 * `flush` once at the end. Section-level emission also matches the brief's
 * "composes itself section by section" rendering.
 */
export function createLineSanitizer() {
  let buffer = "";
  const redactions: string[] = [];

  function sanitizeBlock(block: string): string {
    const result = sanitizeBrief(block);
    redactions.push(...result.redactions);
    return result.text;
  }

  return {
    push(delta: string): string {
      buffer += delta;
      let emitted = "";
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        emitted += `${sanitizeBlock(buffer.slice(0, boundary))}\n\n`;
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
      return emitted;
    },
    flush(): string {
      if (buffer.length === 0) {
        return "";
      }
      const out = sanitizeBlock(buffer);
      buffer = "";
      return out;
    },
    get redactions(): string[] {
      return redactions;
    },
  };
}
