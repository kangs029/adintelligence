export type AnchorDisplayKind = "temple" | "grocery" | "cricket" | "theater";

export type AnchorDisplayInput = {
  kind: AnchorDisplayKind | string;
  name: string;
  qaFlags?: string[];
};

const rawIdPatterns = [
  /^(?:temple|grocery|cricket|theater)\s+\d+$/iu,
  /^(?:node|way|relation)\/\d+$/iu,
];

function normalizedName(name: string) {
  return name.trim().replace(/\s+/gu, " ");
}

function fallbackLabel(kind: string) {
  if (kind === "temple") return "Unnamed temple or community center";
  if (kind === "grocery") return "Unnamed grocery";
  if (kind === "cricket") return "Unnamed cricket ground";
  if (kind === "theater") return "Unnamed theater";
  return "Unnamed anchor";
}

function isRawIdName(name: string) {
  return rawIdPatterns.some((pattern) => pattern.test(name));
}

export function displayAnchorName(anchor: AnchorDisplayInput) {
  const name = normalizedName(anchor.name);
  if (!name || isRawIdName(name) || anchor.qaFlags?.includes("generic-name")) {
    return fallbackLabel(anchor.kind);
  }

  return name;
}

export function anchorKindNoun(kind: AnchorDisplayKind | string) {
  if (kind === "temple") return "temple";
  if (kind === "grocery") return "grocery";
  if (kind === "cricket") return "cricket";
  if (kind === "theater") return "theater";
  return "anchor";
}
