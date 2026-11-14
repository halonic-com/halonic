import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { UpdateStatus } from "./updater-status.ts";

/**
 * How the three ways to "Restart to update" (the status bar item, About Halonic and Ctrl K) reach
 * the one restart dialog. The dialog host listens; it also reports the updater's status, so Ctrl K
 * can offer the command only while an update is ready.
 */
export interface RestartFlow {
  /** Asks the host to restart, through the dialog when runs would stop. Does nothing unless ready. */
  request(): void;
  /** Calls `listener` on each `request`. Returns the function that stops it. */
  onRequest(listener: () => void): () => void;
  /** The host tells the flow where the updater is. */
  report(status: UpdateStatus): void;
  /** Whether an update is ready to install and this app may restart for it. */
  canRestart(): boolean;
}

/** Whether Restart to update applies to this status: ready, and nothing else manages updates. */
export function restartApplies(status: UpdateStatus | null): boolean {
  return status !== null && status.state.kind === "ready" && status.managed === null;
}

/** Makes a flow with no host listening yet. */
export function createRestartFlow(): RestartFlow {
  const listeners = new Set<() => void>();
  let status: UpdateStatus | null = null;
  return {
    request() {
      if (!restartApplies(status)) return;
      for (const listener of listeners) listener();
    },
    onRequest(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    report(next) {
      status = next;
    },
    canRestart: () => restartApplies(status),
  };
}

/** The window's restart flow; the Settings feature provides it. */
export const RestartFlowService: ServiceKey<RestartFlow> =
  serviceKey<RestartFlow>("settings.restart-flow");
