import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { sanitizePublicAnchorTags } from "../pipeline/anchors/sanitize-tags.mjs";
import { writeDeterministicJson } from "../pipeline/lib/provenance.mjs";

const root = process.cwd();
const anchorsPath = join(root, "data", "artifacts", "anchors.json");
const artifact = JSON.parse(await readFile(anchorsPath, "utf8"));

artifact.data.anchors = artifact.data.anchors.map((anchor) => ({
  ...anchor,
  tags: sanitizePublicAnchorTags(anchor.tags),
}));

await writeDeterministicJson(anchorsPath, artifact);
