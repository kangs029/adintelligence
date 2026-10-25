"use client";

import { useEffect } from "react";

const HASH_ALIASES: Record<string, string> = {
  proof: "proof",
  "proof-gate": "proof",
  "measurement-proof": "proof",
};

function scrollToHashTarget() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;

  const decodedHash = decodeURIComponent(hash);
  const target = document.getElementById(HASH_ALIASES[decodedHash] ?? decodedHash);
  target?.scrollIntoView({ block: "start" });
}

export function PlaybookHashScroll() {
  useEffect(() => {
    window.requestAnimationFrame(scrollToHashTarget);
    const timer = window.setTimeout(scrollToHashTarget, 120);
    window.addEventListener("hashchange", scrollToHashTarget);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", scrollToHashTarget);
    };
  }, []);

  return null;
}
