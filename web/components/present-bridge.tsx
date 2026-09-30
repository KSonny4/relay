"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isPresentMode, presentedStartOpensRecord, readPresentedCommand } from "@/lib/present-mode";
import { deliverPresentedCommand, retainPresentedStart } from "@/lib/present-queue";

type DeckMessage = { origin: string; data: unknown };

declare global {
  interface Window {
    __relayDeckQueue?: DeckMessage[];
    __relayDeckReady?: boolean;
  }
}

export function PresentBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!isPresentMode(window.location.search)) return;

    function handle(item: DeckMessage) {
      const command = readPresentedCommand(item);
      if (!command) return;
      if (command === "start" && presentedStartOpensRecord(window.location.pathname)) {
        retainPresentedStart();
        router.push("/record?present=1");
        return;
      }
      deliverPresentedCommand(command);
    }

    function onDeck(event: Event) {
      handle((event as CustomEvent<DeckMessage>).detail);
    }

    window.addEventListener("relay-deck", onDeck);
    window.__relayDeckReady = true;
    const queued = window.__relayDeckQueue ?? [];
    window.__relayDeckQueue = [];
    queued.forEach(handle);

    return () => {
      window.__relayDeckReady = false;
      window.removeEventListener("relay-deck", onDeck);
    };
  }, [router]);

  return null;
}
