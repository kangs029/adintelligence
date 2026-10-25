"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const steps = [
  {
    href: "/",
    caption: "Start with the national map, filters, and evidence-tier dots.",
  },
  {
    href: "/?market=31000US41940",
    caption: "San Jose shows the evidence available for one launch-planning market.",
  },
  {
    href: "/?market=31000US19100",
    caption: "Dallas gives a second market for comparison before channel planning.",
  },
  {
    href: "/competitors#rate-table-title",
    caption: "The rate table separates live quotes, snapshots, and connector-needed rows.",
  },
  {
    href: "/competitors#review-themes-title",
    caption: "Review themes summarize public app-store topic mentions without performance claims.",
  },
  {
    href: "/signals",
    caption: "Signals show dated community threads, creator proof, AI visibility gaps, review pain, and refresh notes.",
  },
  {
    href: "/playbook?market=31000US41940#market-wedge",
    caption: "The San Jose playbook starts with the wedge line and corridor estimate.",
  },
  {
    href: "/playbook?market=31000US41940#measurement-proof-gate",
    caption: "The proof gate shows how one CSV flips a market from hypothesis to data status.",
  },
  {
    href: "/playbook?market=31000US41940#from-evidence-to-proof",
    caption: "The pilot panel closes the demo by naming the Xpat-owned export ask.",
  },
] as const;

function clampStep(value: number) {
  return Math.max(0, Math.min(steps.length - 1, value));
}

function stepHref(index: number) {
  const step = steps[clampStep(index)];
  const [pathAndSearch, hash] = step.href.split("#");
  const [pathname, search = ""] = pathAndSearch.split("?");
  const params = new URLSearchParams(search);
  params.set("tour", "1");
  params.set("tourStep", String(index));

  return `${pathname}?${params.toString()}${hash ? `#${hash}` : ""}`;
}

function currentMatchesStep(index: number) {
  const current = new URL(window.location.href);
  const desired = new URL(stepHref(index), window.location.origin);

  current.searchParams.delete("tour");
  current.searchParams.delete("tourStep");
  desired.searchParams.delete("tour");
  desired.searchParams.delete("tourStep");

  return (
    current.pathname === desired.pathname &&
    current.search === desired.search &&
    current.hash === desired.hash
  );
}

export function Walkthrough() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tourParam = searchParams.get("tour");
  const tourStepParam = searchParams.get("tourStep") ?? "0";
  const tourSignature = `${pathname}?tour=${tourParam ?? ""}&tourStep=${tourStepParam}`;
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(null);
  const isActive = tourParam === "1" && dismissedSignature !== tourSignature;
  const index = useMemo(
    () => clampStep(Number(tourStepParam)),
    [tourStepParam],
  );
  const step = steps[index];
  const goToStep = useCallback(
    (nextIndex: number) => {
      setDismissedSignature(null);
      router.push(stepHref(clampStep(nextIndex)), { scroll: false });
    },
    [router],
  );
  const dismiss = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("tour");
    url.searchParams.delete("tourStep");
    const nextHref = `${url.pathname}${url.search}${url.hash}`;

    setDismissedSignature(tourSignature);
    router.replace(nextHref, { scroll: false });
    window.history.replaceState(window.history.state, "", nextHref);
  }, [router, tourSignature]);

  useEffect(() => {
    if (!isActive) return;

    if (!currentMatchesStep(index)) {
      router.replace(stepHref(index), { scroll: false });
    }
  }, [index, isActive, pathname, router]);

  useEffect(() => {
    if (!isActive) return;

    const hash = step.href.split("#")[1];
    if (!hash) return;

    const id = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 150);

    return () => window.clearTimeout(id);
  }, [index, isActive, step.href]);

  useEffect(() => {
    if (!isActive) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToStep(index + 1);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToStep(index - 1);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismiss, goToStep, index, isActive]);

  if (!isActive) return null;

  return (
    <div
      className="tour-bar"
      role="status"
      aria-label="Walkthrough"
      data-tour-step={index + 1}
    >
      <span className="tour-step">
        Step {index + 1} of {steps.length}
      </span>
      <p>{step.caption}</p>
      <div className="tour-actions">
        {index === 0 ? (
          <button aria-label="Previous walkthrough step" disabled type="button">
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
        ) : (
          <a
            aria-label="Previous walkthrough step"
            href={stepHref(index - 1)}
            role="button"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </a>
        )}
        {index === steps.length - 1 ? (
          <button aria-label="Next walkthrough step" disabled type="button">
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <a
            aria-label="Next walkthrough step"
            href={stepHref(index + 1)}
            role="button"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </a>
        )}
        <button aria-label="Close walkthrough" type="button" onClick={dismiss}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
