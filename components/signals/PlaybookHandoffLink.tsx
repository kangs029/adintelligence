"use client";

import {
  createContext,
  type MouseEvent,
  type ReactNode,
  useContext,
  useSyncExternalStore,
} from "react";
import {
  isPlaybookMarketGeoid,
  playbookHandoffHref,
  PLAYBOOK_LAST_MARKET_KEY,
  type PlaybookHandoffAnchor,
} from "@/lib/playbook/handoff";

const PlaybookHandoffContext = createContext<string | null>(null);

export function PlaybookHandoffProvider({
  children,
  defaultMarketGeoid,
}: {
  children: ReactNode;
  defaultMarketGeoid: string;
}) {
  return (
    <PlaybookHandoffContext.Provider value={defaultMarketGeoid}>
      {children}
    </PlaybookHandoffContext.Provider>
  );
}

function readStoredMarket(defaultMarketGeoid: string) {
  if (typeof window === "undefined") return defaultMarketGeoid;

  try {
    const stored = window.localStorage.getItem(PLAYBOOK_LAST_MARKET_KEY);
    return isPlaybookMarketGeoid(stored) ? stored : defaultMarketGeoid;
  } catch {
    return defaultMarketGeoid;
  }
}

function subscribeToStoredMarket(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
  };
}

function storedMarketSnapshot() {
  try {
    return window.localStorage.getItem(PLAYBOOK_LAST_MARKET_KEY);
  } catch {
    return null;
  }
}

function serverStoredMarketSnapshot() {
  return null;
}

export function PlaybookHandoffLink({
  anchor,
  children,
  className,
}: {
  anchor: PlaybookHandoffAnchor;
  children: ReactNode;
  className?: string;
}) {
  const defaultMarketGeoid = useContext(PlaybookHandoffContext);
  const fallbackMarketGeoid = isPlaybookMarketGeoid(defaultMarketGeoid)
    ? defaultMarketGeoid
    : "31000US45940";
  const storedMarket = useSyncExternalStore(
    subscribeToStoredMarket,
    storedMarketSnapshot,
    serverStoredMarketSnapshot,
  );
  const targetMarketGeoid = isPlaybookMarketGeoid(storedMarket)
    ? storedMarket
    : fallbackMarketGeoid;
  const href = playbookHandoffHref(targetMarketGeoid, anchor);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }

    event.preventDefault();
    window.location.assign(playbookHandoffHref(readStoredMarket(fallbackMarketGeoid), anchor));
  }

  return (
    <a className={className} href={href} onClick={handleClick}>
      {children}
    </a>
  );
}
