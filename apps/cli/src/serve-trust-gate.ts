// The trust check behind `halonic serve`: the host's read-only gate for the
// workspace it serves. It reads the workspace and the trust record again for
// every question, so a workspace that changed after it was trusted starts no
// run (`server.trust-gate`). It has no way to grant trust: only a person at
// the computer does, with `halonic trust`.

import type { TrustDecision, TrustGate, TrustState } from "@halonicjs/host-server";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import type { Message } from "./messages/define.ts";
import { plainText } from "./messages/phrase.ts";
import { serveMessages } from "./messages/serve.ts";
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
 * The gate for the workspace in `dir`. Each `check` loads the workspace's
 * files and the programs its connectors name, and asks the trust record.
 * It counts anything it can't read as `unreadable`, so a failure never
 * reads as trust.
 */
export function workspaceTrustGate(
  dir: OpenWorkspaceDir,
  machine: WorkspaceTrustMachine,
): TrustGate {
  return {
    async check(): Promise<TrustDecision> {
      const { state, sentence } = await trustAnswerOf(dir, machine);
      return { state, message: plainText(sentence.phrase) };
    },
  };
}

async function trustAnswerOf(
  dir: OpenWorkspaceDir,
  machine: WorkspaceTrustMachine,
): Promise<{ readonly state: TrustState; readonly sentence: Message }> {
  let loaded: LoadedWorkspace;
  try {
    loaded = await loadWorkspace(dir.store);
  } catch {
    return { state: "unreadable", sentence: sentenceOf.unreadable() };
  }
  const state = await workspaceTrustState(dir, machine, loaded);
  // A workspace that reaches only the test model starts nothing that
  // needs trust, so it answers `trusted` with its own sentence (HAL-12011).
  if (state === "not-needed") {
    return { state: "trusted", sentence: serveMessages.trustNotNeeded() };
  }
  return { state, sentence: sentenceOf[state]() };
}
