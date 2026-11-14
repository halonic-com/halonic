// The trust check behind `halonic serve`: the host's read-only gate for the
// workspace it serves. It reads the workspace and the trust record again for
// every question, so a workspace that changed after it was trusted starts no
// run (`server.trust-gate`). It has no way to grant trust: only a person at
// the computer does, with `halonic trust`.

import type { TrustDecision, TrustGate, TrustState } from "@halonicjs/host-server";
import { loadWorkspace } from "@halonicjs/workspace";
import type { Message } from "./messages/define.ts";
import { plainText } from "./messages/phrase.ts";
import { serveMessages } from "./messages/serve.ts";
import type { OpenWorkspaceDir } from "./workspace-dir.ts";
import {
  cliTrustService,
  readWorkspaceTrust,
  type WorkspaceTrustMachine,
} from "./workspace-trust.ts";

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
      const state = await trustStateOf(dir, machine);
      return { state, message: plainText(sentenceOf[state]().phrase) };
    },
  };
}

async function trustStateOf(
  dir: OpenWorkspaceDir,
  machine: WorkspaceTrustMachine,
): Promise<TrustState> {
  try {
    const workspace = await readWorkspaceTrust(
      dir,
      machine.commandSearch,
      await loadWorkspace(dir.store),
    );
    const { status } = await cliTrustService(machine.trustStore, machine.clock).check(
      workspace.subject,
    );
    return status;
  } catch {
    return "unreadable";
  }
}
