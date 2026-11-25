import { useEffect, useState } from "react";
import type { NearbyComputer, NearbyComputers, NearbyStart } from "./nearby-computers.ts";

/** How long "Looking for computers…" shows before "No computers found yet" (G10). */
export const LOOKING_MS = 5000;

/**
 * The picker's view of the computers on this Wi-Fi: `asking` until the browse answers (Android
 * may be asking about Nearby devices meanwhile), then how it started, the list, and whether it
 * has looked for {@link LOOKING_MS} yet.
 */
export interface NearbyView {
  readonly start: NearbyStart | { readonly kind: "asking" };
  readonly computers: readonly NearbyComputer[];
  readonly searched: boolean;
}

/**
 * Browses for computers on this Wi-Fi while the calling screen shows, and stops when it leaves.
 * Without the port (not the Android app) the answer is `unavailable` at once.
 */
export function useNearby(nearby: NearbyComputers | undefined): NearbyView {
  const [start, setStart] = useState<NearbyView["start"]>(
    nearby === undefined ? { kind: "unavailable" } : { kind: "asking" },
  );
  const [computers, setComputers] = useState<readonly NearbyComputer[]>([]);
  const [searched, setSearched] = useState(false);
  useEffect(() => {
    if (nearby === undefined) return;
    let showing = true;
    setStart({ kind: "asking" });
    setSearched(false);
    nearby
      .browse((listed) => {
        if (showing) setComputers(listed);
      })
      // A browse the shell refused finds nothing, as one that couldn't start.
      .catch((): NearbyStart => ({ kind: "unavailable" }))
      .then((answer) => {
        if (showing) setStart(answer);
      });
    return () => {
      showing = false;
      // Leaving has no screen to show a failure on; the shell stops browsing when the page goes.
      nearby.stop().catch(() => undefined);
    };
  }, [nearby]);
  const browsing = start.kind === "browsing";
  useEffect(() => {
    if (!browsing) return;
    const timer = setTimeout(() => setSearched(true), LOOKING_MS);
    return () => clearTimeout(timer);
  }, [browsing]);
  return { start, computers: browsing ? computers : [], searched };
}
