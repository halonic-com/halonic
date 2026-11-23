// The trust check behind `halonic serve`: the host's read-only gate for the
// workspace it serves, in the CLI's words. The gate itself lives in the
// workspace engine, so the agent host's engine role reads trust the same way
// (HAL-17049). It has no way to grant trust: only a person at the computer
// does, with `halonic trust`, which reviews the same version (HAL-16335).

import {
  workspaceTrustGate as engineTrustGate,
  type TrustGateSentences,
} from "@halonicjs/adapter-workspace-engine-node";
import type { TrustGate } from "@halonicjs/host-server";
import type { Message } from "./messages/define.ts";
import { plainText } from "./messages/phrase.ts";
import { serveMessages } from "./messages/serve.ts";
import type { WorkspaceAtVersion } from "./workspace-at-version.ts";
import type { OpenWorkspaceDir } from "./workspace-dir.ts";
import type { WorkspaceTrustMachine } from "./workspace-trust.ts";

/** `message` as the plain text a gate answers with. */
function plain(message: () => Message): () => string {
  return () => plainText(message().phrase);
}

const serveSentences: TrustGateSentences = {
  trusted: plain(serveMessages.trusted),
  new: plain(serveMessages.trustNew),
  changed: plain(serveMessages.trustChanged),
  unreadable: plain(serveMessages.trustUnreadable),
  refused: plain(serveMessages.trustRefused),
  // A workspace that reaches only the test model answers `trusted`, with its own sentence (HAL-12011).
  "not-needed": plain(serveMessages.trustNotNeeded),
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
  return engineTrustGate(dir, machine, readVersion, serveSentences);
}
