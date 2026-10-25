import { z } from "zod";

import { loadArtifact } from "./loader";

export const AnchorSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["temple", "grocery", "cricket", "theater"]),
  name: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  marketGeoid: z.string().regex(/^31000US\d{5}$/),
  osmUrl: z.string().url(),
  tags: z.record(z.string(), z.string()),
  qaFlags: z.array(z.string()),
});

export const AnchorsDataSchema = z.object({
  capturedAt: z.string().datetime({ offset: true }),
  marketRollups: z
    .record(
      z.string().regex(/^31000US\d{5}$/),
      z.object({
        temples: z.number().int().nonnegative(),
        groceries: z.number().int().nonnegative(),
        cricket: z.number().int().nonnegative(),
        theaters: z.number().int().nonnegative(),
        per10kAI: z.number().nonnegative(),
      }),
    )
    .optional(),
  sweptMarkets: z.array(z.string().regex(/^31000US\d{5}$/)).optional(),
  anchors: z.array(AnchorSchema),
});

export type Anchor = z.infer<typeof AnchorSchema>;
export type AnchorsData = z.infer<typeof AnchorsDataSchema>;

interface GetAnchorsOptions {
  root?: string;
}

export function getAnchorsArtifact(options: GetAnchorsOptions = {}) {
  return loadArtifact("anchors", AnchorsDataSchema, options);
}
