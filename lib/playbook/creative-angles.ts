import type { PlaybookPersona } from "./dossier";

export type CreativeAngleTemplate = {
  cta: string;
  format: string;
  funnelStage: "awareness" | "consideration" | "conversion";
  groundingSignal: {
    href: string;
    label: string;
  };
  headline: string;
  id: string;
  measurementGoal: string;
  personaId: string;
  primaryCopy: string;
  risk: string;
  targetingRecipe: string;
  whyItWorks: string;
};

const IRS_SOURCE_URL =
  "https://www.irs.gov/newsroom/treasury-irs-provide-penalty-relief-for-remittance-transfer-providers-who-fail-to-deposit-excise-tax-under-the-one-big-beautiful-bill";

export const CREATIVE_ANGLE_TEMPLATES: CreativeAngleTemplate[] = [
  {
    cta: "Compare the quote",
    format: "Google Search RSA plus rate-education landing page",
    funnelStage: "conversion",
    groundingSignal: { href: "/competitors#review-themes-title", label: "review pain themes" },
    headline: "Rate clarity for engineers who do the math",
    id: "h1b-rate-clarity",
    measurementGoal: "Connector-needed export schema: comparison-page engagement by market and campaign.",
    personaId: "h1b-mid-career",
    primaryCopy:
      "Recurring India transfers add up. Test published-rate clarity, fee visibility, and status expectations for professionals comparing options.",
    risk: "Keep H-1B employer filings (LCA) as an employer/workforce proxy. Do not infer individual immigration status.",
    targetingRecipe:
      "Search terms around USD to INR, best way to send money to India, and competitor comparisons in the selected market.",
    whyItWorks:
      "The persona fit score is strongest where income, employment proxy, population, and concentration combine.",
  },
  {
    cta: "Save the family-support checklist",
    format: "Meta single image or short video",
    funnelStage: "consideration",
    groundingSignal: { href: "/competitors#review-themes-title", label: "support and timing review themes" },
    headline: "Family support needs clear status, not guesswork",
    id: "family-status-clarity",
    measurementGoal: "Connector-needed export schema: saved comparison and quote-page engagement by market.",
    personaId: "family-remitter",
    primaryCopy:
      "For families sending support home, test trust-first copy around clear delivery expectations, proactive status, and support visibility.",
    risk: "Do not promise speed or support outcomes beyond approved product language.",
    targetingRecipe: "Local Indian community radius around grocery, temple, and cricket surfaces with transparent-rate education copy.",
    whyItWorks:
      "Family-remitter fit rises where population, concentration, temples, groceries, and community-place density are strong.",
  },
  {
    cta: "Start with the setup guide",
    format: "Campus story, Reddit promoted post, or student association handout",
    funnelStage: "conversion",
    groundingSignal: { href: "/signals", label: "student and community signals" },
    headline: "First US-to-India setup without the confusion",
    id: "student-setup-guide",
    measurementGoal: "Connector-needed export schema: setup-guide engagement and source-tagged starts.",
    personaId: "graduate-student-opt",
    primaryCopy:
      "Test a first-remittance setup guide for Indian students and OPT workers, focused on fee visibility, verification steps, and support expectations.",
    risk: "Student counts are state-allocated. Keep the copy educational and avoid school-level claims.",
    targetingRecipe: "Campus-adjacent geo tests and student association surfaces where evidence exists.",
    whyItWorks:
      "Student share and student volume increase the relevance of low-friction setup education.",
  },
  {
    cta: "See the first-transfer checklist",
    format: "Explainer carousel",
    funnelStage: "consideration",
    groundingSignal: { href: "/signals#community-threads-title", label: "setup and support discussion surfaces" },
    headline: "Know the steps before you send",
    id: "first-time-checklist",
    measurementGoal: "Connector-needed export schema: checklist saves and quote-page engagement.",
    personaId: "first-time-remitter",
    primaryCopy:
      "Test simple onboarding education: what to compare, what details are needed, and how support should be reached before a transfer starts.",
    risk: "Avoid advice language. The play is education and source-tagged learning.",
    targetingRecipe: "Student-heavy markets with community-place evidence and setup or support pain themes.",
    whyItWorks:
      "First-time-remitter fit combines student share, concentration, grocery, temple, and community-place density evidence.",
  },
  {
    cta: "Review the documentation checklist",
    format: "Search landing page plus LinkedIn-style explainer",
    funnelStage: "consideration",
    groundingSignal: { href: "/competitors#positioning-matrix-title", label: "competitor positioning snapshot" },
    headline: "Larger India transfers need rate and paperwork clarity",
    id: "returning-nri-documentation",
    measurementGoal: "Connector-needed export schema: documentation-page engagement by market and source.",
    personaId: "returning-nri-investor",
    primaryCopy:
      "Test documentation-first copy for established NRIs who compare rates, support, and required details before moving larger amounts.",
    risk: "Tax and regulatory language needs review before publishing.",
    targetingRecipe: "High-income markets with large Asian Indian population and strong local concentration.",
    whyItWorks: "This persona scores higher where income, population, concentration, and trust-building community places are strong.",
  },
  {
    cta: "Check the rule before you send",
    format: "Creator education read or short-form explainer",
    funnelStage: "awareness",
    groundingSignal: { href: IRS_SOURCE_URL, label: "IRS remittance-tax source" },
    headline: "Remittance-tax questions need current sources",
    id: "tax-season-source-check",
    measurementGoal: "Connector-needed export schema: source-check engagement and creator-link clicks.",
    personaId: "tax-season-remitter",
    primaryCopy:
      "Test timely education copy that routes people to current official sources before turning tax headlines into remittance decisions.",
    risk: "Policy details change. Keep this as source education, not tax advice.",
    targetingRecipe: "Seasonal content around tax windows, high-income markets, and creator audiences with NRI finance overlap.",
    whyItWorks:
      "The tax-season persona combines income, employment proxy, population, and student or family timing signals.",
  },
  {
    cta: "Compare the alternative",
    format: "Google Search comparison terms plus creator proof read",
    funnelStage: "conversion",
    groundingSignal: { href: "/competitors#review-themes-title", label: "competitor review-frequency themes" },
    headline: "Switch-signal creative for comparison shoppers",
    id: "switch-signal",
    measurementGoal: "Connector-needed export schema: alternative-term engagement and source-tagged starts.",
    personaId: "competitor-switcher",
    primaryCopy:
      "Test factual comparison copy against public pain themes: timing clarity, support visibility, fee visibility, and app reliability.",
    risk: "Stay factual when naming competitors. Do not disparage or imply competitor outcomes in this market.",
    targetingRecipe: "Search terms around alternatives to Remitly, Xoom, Wise, and Western Union, plus creator links with disclosures.",
    whyItWorks:
      "Switcher fit rises where population, concentration, community-place density, and public review themes create enough comparison context.",
  },
];

export function creativeAnglesForPersonas(personas: PlaybookPersona[]) {
  const eligible = new Set(
    personas
      .filter((persona) => persona.confidence === "high" || persona.confidence === "medium")
      .map((persona) => persona.personaId),
  );

  return CREATIVE_ANGLE_TEMPLATES.filter((template) => eligible.has(template.personaId)).slice(0, 4);
}
