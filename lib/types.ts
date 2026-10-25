import { z } from "zod";

export const provenanceValues = [
  "live",
  "snapshot",
  "grounded",
  "derived",
  "connector-needed",
] as const;

export type Provenance = (typeof provenanceValues)[number];

export interface ArtifactMeta {
  family: string;
  version: number;
  generatedAt: string;
  provenance: Provenance;
  source: string;
  method: string;
  refreshCadence: string;
  caveats: string[];
}

export interface Artifact<T> {
  meta: ArtifactMeta;
  data: T;
}

export const ProvenanceSchema = z.enum(provenanceValues);

export const ArtifactMetaSchema = z.object({
  family: z.string().min(1),
  version: z.number().int().positive(),
  generatedAt: z.string().datetime({ offset: true }),
  provenance: ProvenanceSchema,
  source: z.string().min(1),
  method: z.string().min(1),
  refreshCadence: z.string().min(1),
  caveats: z.array(z.string()),
}) satisfies z.ZodType<ArtifactMeta>;

export function createArtifactSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    meta: ArtifactMetaSchema,
    data: dataSchema,
  });
}
