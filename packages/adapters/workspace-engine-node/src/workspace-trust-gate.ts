// The read-only trust gate for a workspace a host serves (`server.trust-gate`).
// It reads the version runs start from and the trust record again for every
// question, so a workspace that changed after it was trusted starts no run.
// It has no way to grant trust. Its sentences come from the caller, so the
// CLI and the Studio each say it in their own words (HAL-17049).

import {
  type TrustedFolder,
  type TrustReadMachine,
  type WorkspaceAtVersion,
  type WorkspaceTrustState,
  workspaceTrustState,
} from "./workspace-trust-state.ts";

/**
 * A gate's answer: `not-needed` reads as `trusted`, because a workspace that
 * reaches only the test model starts nothing that needs trust (HAL-12011).
 * It matches the host's `TrustDecision`, which an adapter can't import.
 */
export interface WorkspaceTrustDecision {
  readonly state: Exclude<WorkspaceTrustState, "not-needed">;
  /** The caller's sentence for the state, safe to show: no file, path or fingerprint. */
  readonly message: string;
}

/** The caller's sentence for each state, `not-needed` included, as plain text. */
export type TrustGateSentences = Readonly<Record<WorkspaceTrustState, () => string>>;

/** A gate that answers where trust stands now, each time it is asked. */
export interface WorkspaceTrustGate {
  check(): Promise<WorkspaceTrustDecision>;
}

/**
 * The gate for the workspace in `dir`. Each `check` reads the version
 * `readVersion` gives, the one served runs start from now, finds the
 * programs its connectors name, and asks the trust record. It counts
 * anything it can't read as `unreadable`, so a failure never reads as trust.
 */
export function workspaceTrustGate(
  dir: TrustedFolder,
  machine: TrustReadMachine,
  readVersion: () => Promise<WorkspaceAtVersion>,
  sentences: TrustGateSentences,
): WorkspaceTrustGate {
  return {
    async check(): Promise<WorkspaceTrustDecision> {
      const { state } = await workspaceTrustState(dir, machine, readVersion);
      const message = sentences[state]();
      return { state: state === "not-needed" ? "trusted" : state, message };
    },
  };
}
