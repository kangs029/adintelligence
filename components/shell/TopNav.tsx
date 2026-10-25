"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SourceLink } from "@/components/shell/SourceLink";

const navItems = [
  { href: "/", label: "Market Map" },
  { href: "/competitors", label: "Competitors" },
  { href: "/signals", label: "Signals" },
  { href: "/playbook", label: "Playbook" },
];

interface TopNavProps {
  freshnessLabel: string;
}

function formatDateLabel(dateStr: string): string {
  // Convert "2026-10-12" to "Oct 12, 2026"
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TopNav({ freshnessLabel }: TopNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [adsFreshness, setAdsFreshness] = useState<string | null>(null);

  useEffect(() => {
    // Fetch latest ads data date from DynamoDB
    fetch("/api/ads-freshness")
      .then((res) => res.json())
      .then((data) => {
        if (data.latestDate) {
          setAdsFreshness(formatDateLabel(data.latestDate));
        }
      })
      .catch(() => {
        // Silently fail, will show fallback
      });
  }, []);

  function handleAdAnalyst() {
    window.dispatchEvent(new CustomEvent("xpat:open-ad-analyst"));
  }

  // Use ads freshness if available, otherwise fall back to artifact freshness
  const displayFreshness = adsFreshness ?? freshnessLabel;

  return (
    <nav className="top-nav" aria-label="Primary">
      <Link className="brand-mark" href="/" aria-label="Xpat OS home">
        XPAT&nbsp;OS
      </Link>
      <div className="nav-tabs">
        {navItems.map((item) => {
          const isCurrent =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

          return (
            <Link
              aria-current={isCurrent ? "page" : undefined}
              className="nav-tab"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      <span className="freshness">
        data as of <strong>{displayFreshness}</strong> ·{" "}
        <SourceLink href="/sources">sources</SourceLink>
      </span>
      <button
        className="ad-analyst-nav-btn"
        type="button"
        onClick={handleAdAnalyst}
      >
        Ask Ad Analyst
      </button>
      <button
        className="tour-nav-button"
        type="button"
        onClick={() => router.push("/?tour=1&tourStep=0")}
      >
        Walkthrough
      </button>
    </nav>
  );
}
