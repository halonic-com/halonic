import { useCallback, useEffect, useRef, useState } from "react";
import type { UpdaterHost } from "../api.ts";
import { checkAnnouncement } from "./about-state.ts";
import type { UpdateStatus } from "./updater-status.ts";

/** What About Halonic can do. Each action starts only when the person presses its button. */
export interface UpdaterControls {
  /** The status now, or `null` until the shell has answered. */
  readonly status: UpdateStatus | null;
  /** True when the shell didn't answer a press or the first read, so the section can say so. */
  readonly unanswered: boolean;
  readonly checkNow: () => void;
  readonly download: () => void;
  readonly cancel: () => void;
  readonly setAutomatic: (on: boolean) => void;
}

/**
 * Follows the updater while About Halonic is open and passes the person's presses on. Opening
 * the section never checks or downloads: `subscribe` only reads (`settings.updater-interface`).
 * A result of Check now is announced with the version, also when nothing changed.
 */
export function useUpdater(host: UpdaterHost, announce: (line: string) => void): UpdaterControls {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [unanswered, setUnanswered] = useState(false);
  const alive = useRef(true);
  // The container passes a new `announce` on every render; the effects must not restart for it.
  const announceRef = useRef(announce);
  announceRef.current = announce;

  useEffect(() => {
    alive.current = true;
    const stop = host.subscribe((next) => {
      if (!alive.current) return;
      setUnanswered(false);
      setStatus(next);
    });
    return () => {
      alive.current = false;
      stop();
    };
  }, [host]);

  const press = useCallback(async (act: () => Promise<UpdateStatus>, announceResult = false) => {
    try {
      const next = await act();
      if (!alive.current) return;
      setUnanswered(false);
      setStatus(next);
      const line = announceResult ? checkAnnouncement(next, new Date()) : null;
      if (line !== null) announceRef.current(line);
    } catch {
      // The words say it; the shell keeps the detail in its own log.
      if (alive.current) setUnanswered(true);
    }
  }, []);

  return {
    status,
    unanswered,
    checkNow: () => void press(() => host.check(), true),
    download: () => void press(() => host.download()),
    cancel: () => void press(() => host.cancel()),
    setAutomatic: (on) => void press(() => host.setAutomatic(on)),
  };
}
