// The trust check behind `halonic serve`: the host's read-only gate for the
// workspace it serves. It reads the version served runs start from and the
// trust record again for every question, so a workspace that changed after
// it was trusted starts no run (`server.trust-gate`). It has no way to grant
// trust: only a person at the computer does, with `halonic trust`, which
// reviews the same version (HAL-16335).

import type { TrustDecision, TrustGate, TrustState } from "@halonicjs/host-server";
import type { Message } from "./messages/define.ts";
import { plainText } from "./messages/phrase.ts";
import { serveMessages } from "./messages/serve.ts";
import type { WorkspaceAtVersion } from "./workspace-at-version.ts";
import type { OpenWorkspaceDir } from "./workspace-dir.ts";
import { type WorkspaceTrustMachine, workspaceTrustState } from "./workspace-trust.ts";

const sentenceOf: Readonly<Record<TrustState, () => Message>> = {
  trusted: serveMessages.trusted,
  new: serveMessages.trustNew,
  changed: serveMessages.trustChanged,
  unreadable: serveMessages.trustUnreadable,
  refused: serveMessages.trustRefused,
};

/**
 * The gate for the workspace in `dir`. Each `check` reads the version
 * `readVersion` gives, the one served runs start from now, finds the
 * programs its connectors name, and asks the trust record. It counts
 * anything it can't read as `unreadable`, so a failure never reads as trust.
 */
export function workspaceTrustGate(
  dir: OpenWorkspaceDir,
  machine: WorkspaceTrustMachine,
  readVersion: () => Promise<WorkspaceAtVersion>,
): TrustGate {
  return {
    async check(): Promise<TrustDecision> {
      const { state, sentence } = await trustAnswerOf(dir, machine, readVersion);
      return { state, message: plainText(sentence.phrase) };
    },
  };
}

async function trustAnswerOf(
  dir: OpenWorkspaceDir,
  machine: WorkspaceTrustMachine,
  readVersion: () => Promise<WorkspaceAtVersion>,
): Promise<{ readonly state: TrustState; readonly sentence: Message }> {
  const { state } = await workspaceTrustState(dir, machine, readVersion);
  // A workspace that reaches only the test model starts nothing that
  // needs trust, so it answers `trusted` with its own sentence (HAL-12011).
  if (state === "not-needed") {
    return { state: "trusted", sentence: serveMessages.trustNotNeeded() };
  }
  return { state, sentence: sentenceOf[state]() };
}
