import {
  allowedMissingDataContext,
  bannedPerformanceClaims,
  type ClaimRule,
} from "./banned";

export interface ClaimViolation {
  path: string;
  term: string;
  rule: ClaimRule;
}

export type ClaimContext = "dossier" | "copy";

type WalkItem = {
  path: string;
  value: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walk(value: unknown, path = "$"): WalkItem[] {
  if (typeof value === "string") return [{ path, value }];

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => walk(item, `${path}[${index}]`));
  }

  if (isPlainObject(value)) {
    return Object.entries(value).flatMap(([key, item]) => walk(item, `${path}.${key}`));
  }

  return [];
}

function isAllowedContext(text: string) {
  return allowedMissingDataContext.some((pattern) => pattern.test(text));
}

function isSchemaFieldPath(path: string) {
  return /\.xpatNeeds\[\d+\]\.fields\[\d+\]$/u.test(path);
}

function hasBenchmarkReference(text: string) {
  return /reference market/iu.test(text) || /compare against [A-Z][A-Za-z .-]+/u.test(text);
}

function hasBudgetEstimate(text: string) {
  return /\b(estimate|estimated|labeled estimate)\b/iu.test(text);
}

function looksLikeBudgetEstimate(text: string) {
  return /\bbudget\b/iu.test(text) && /(?:\$|₹|\b\d[\d,]*(?:\.\d+)?\b)/u.test(text);
}

function violatesAnchorBoundary(text: string) {
  const mentionsAnchor = /\b(anchor|temple|grocery|groceries|cricket|theater|theatre)\b/iu.test(text);
  const claimsCustomers = /\bcustomer counts?\b/iu.test(text);
  const allowed = /community presence evidence/iu.test(text);

  return mentionsAnchor && claimsCustomers && !allowed;
}

function violatesWorkforceProxyBoundary(text: string) {
  const mentionsProxySource = /\b(H-?1B|LCA)\b/iu.test(text);
  const claimsPeople = /\b(target|individual|person|people|workers?|visa status)\b/iu.test(text);
  const allowed = /employer\/workforce proxy/iu.test(text);

  return mentionsProxySource && claimsPeople && !allowed;
}

function violatesLocalClaimBoundary(text: string) {
  const mentionsCorridorEvidence = /\bcorridor[- ]wide\b|\bpublic (?:review|ad|competitor|rate)/iu.test(text);
  const mentionsLocalMarket = /\b(San Jose|Dallas|Detroit|Indianapolis|market|local)\b/u.test(text);
  const claimsCertainty = /\b(proves?|will|guarantees?|delivers?|switch)\b/iu.test(text);
  const allowedHypothesis = /\b(hypothesis|test|suggests?|may|could|candidate)\b/iu.test(text);

  return mentionsCorridorEvidence && mentionsLocalMarket && claimsCertainty && !allowedHypothesis;
}

function collectStringViolations({
  context,
  path,
  text,
}: {
  context: ClaimContext;
  path: string;
  text: string;
}) {
  const violations: ClaimViolation[] = [];
  const allowed = isAllowedContext(text) || isSchemaFieldPath(path);

  if (!allowed) {
    for (const claim of bannedPerformanceClaims) {
      if (claim.pattern.test(text)) {
        violations.push({
          path,
          rule: "public-data-performance-claim",
          term: claim.term,
        });
      }
    }
  }

  if (context === "dossier" && /\bbenchmark\b/iu.test(text) && !hasBenchmarkReference(text)) {
    violations.push({
      path,
      rule: "benchmark-reference-required",
      term: "benchmark",
    });
  }

  if (context === "dossier" && looksLikeBudgetEstimate(text) && !hasBudgetEstimate(text)) {
    violations.push({
      path,
      rule: "estimate-label-required",
      term: "budget",
    });
  }

  if (context === "dossier" && violatesLocalClaimBoundary(text)) {
    violations.push({
      path,
      rule: "public-data-local-claim",
      term: "corridor evidence",
    });
  }

  if (violatesAnchorBoundary(text)) {
    violations.push({
      path,
      rule: "anchor-evidence-boundary",
      term: "customer counts",
    });
  }

  if (violatesWorkforceProxyBoundary(text)) {
    violations.push({
      path,
      rule: "workforce-proxy-boundary",
      term: /\bH-?1B\b/iu.test(text) ? "H-1B" : "LCA",
    });
  }

  return violations;
}

export function validateClaims(obj: unknown, context: ClaimContext): ClaimViolation[] {
  return walk(obj).flatMap((item) =>
    collectStringViolations({
      context,
      path: item.path,
      text: item.value as string,
    }),
  );
}
