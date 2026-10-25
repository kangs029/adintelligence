"use client";

import { Clipboard } from "lucide-react";
import { useMemo, useState } from "react";

import type { XpatNeed } from "@/lib/playbook/dossier";

interface CopyDataAskButtonProps {
  needs: XpatNeed[];
}

function plainText(needs: XpatNeed[]) {
  return needs
    .map((need) =>
      [
        need.schema,
        `Decision unlocked: ${need.decisionUnlocked}`,
        `Fields: ${need.fields.join(", ")}`,
        need.csvAlternative,
      ].join("\n"),
    )
    .join("\n\n");
}

export function CopyDataAskButton({ needs }: CopyDataAskButtonProps) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => plainText(needs), [needs]);

  return (
    <button
      className="btn"
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }}
    >
      <Clipboard size={16} aria-hidden="true" />
      {copied ? "Copied data ask" : "Copy data ask as email text"}
    </button>
  );
}

export { plainText as dataAskPlainText };
