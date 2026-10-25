/**
 * Step 3 — Draft Response (pipeline entry point)
 *
 * AI logic lives in lib/ai/community-drafter.mjs.
 * This file re-exports everything for backward compatibility with
 * app/api/community/draft/route.ts and any direct imports.
 */

export {
  FTC_DISCLOSURE,
  XPAT_USER_PERSONA,
  DRAFT_RULES,
  fetchKnowledgeBaseContext,
  buildDraftPrompt,
  processDraft,
  generateDraft,
} from "../../lib/ai/community-drafter.mjs";
