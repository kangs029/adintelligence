"use client";

import { Clipboard } from "lucide-react";
import { useState } from "react";

interface CopyGeoPackButtonProps {
  text: string;
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the textarea path for browser contexts without clipboard permission.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function CopyGeoPackButton({ text }: CopyGeoPackButtonProps) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="btn"
      type="button"
      onClick={async () => {
        await copyText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }}
    >
      <Clipboard size={16} aria-hidden="true" />
      {copied ? "Copied geo pack" : "Copy geo pack"}
    </button>
  );
}
