import { z } from "zod";

import { loadArtifact } from "./loader";

export const CensusVariablesSchema = z.object({
  asianIndian: z.literal("B02015_021E"),
  asianIndianMoe: z.literal("B02015_021M"),
  totalPopulation: z.literal("B01003_001E"),
  totalPopulationMoe: z.literal("B01003_001M"),
  medianHouseholdIncome: z.literal("B19013_001E"),
  medianHouseholdIncomeMoe: z.literal("B19013_001M"),
});

export const MarketSchema = z.object({
  geoid: z.string().regex(/^31000US\d{5}$/),
  name: z.string().min(1),
  state: z.string().min(2),
  states: z.array(z.string().min(2)).min(1),
  lat: z.number(),
  lng: z.number(),
  population: z.object({
    asianIndian: z.number().int().nonnegative(),
    moe: z.number().int().nonnegative(),
    total: z.number().int().positive(),
  }),
  concentration: z.object({
    localSharePct: z.number().nonnegative(),
    usSharePct: z.number().nonnegative(),
    multipleOfUS: z.number().nonnegative(),
  }),
  income: z
    .object({
      medianHousehold: z.number().int().nonnegative(),
      moe: z.number().int().nonnegative(),
    })
    .optional(),
  moeReliability: z.enum(["high", "medium", "low"]),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  score: z.number().optional(),
  anchorSummary: z
    .object({
      temples: z.number().int().nonnegative(),
      groceries: z.number().int().nonnegative(),
      cricket: z.number().int().nonnegative(),
      theaters: z.number().int().nonnegative(),
      per10kAI: z.number().nonnegative(),
    })
    .optional(),
  employmentProxy: z
    .object({
      lcaFilings: z.number().int().nonnegative(),
      topEmployers: z.array(z.string()),
    })
    .optional(),
  students: z
    .object({
      activeIndianStudents: z.number().int().nonnegative(),
    })
    .optional(),
});

export const MarketsDataSchema = z.object({
  release: z.literal("ACS 2024 5-year"),
  variables: CensusVariablesSchema,
  summary: z.object({
    inputRows: z.number().int().nonnegative(),
    includedRows: z.number().int().nonnegative(),
    heldOutRows: z.number().int().nonnegative(),
    nationalAsianIndian: z.number().int().nonnegative(),
    nationalPopulation: z.number().int().positive(),
  }),
  markets: z.array(MarketSchema),
});

export type Market = z.infer<typeof MarketSchema>;
export type MarketsData = z.infer<typeof MarketsDataSchema>;

interface GetMarketsOptions {
  root?: string;
}

export function getMarketsArtifact(options: GetMarketsOptions = {}) {
  return loadArtifact("markets", MarketsDataSchema, options);
}
