// The trust check in front of every start of a local integration's runner
// (trust build plan item 8a, HAL-188; I5 design section 5, HAL-958). A
// runner starts only when the workspace's trust check is `trusted`, its
// trusted content covers this integration's folder, and the folder's files
// hash now to the `code` that was trusted. Only then does the start gate
// pick the sandbox. Without all of that it throws and starts no process: no
// sandbox session, no Node, no bridge.
//
// The folder is hashed again at every start, the restart after an idle stop
// included, because files can change while Halonic runs and the trust check
// was made earlier. The fence status is read by the gate per run and is
// never part of the trust content, so a saved yes for running without the
// fence can never stand in for trust.

import type { Digest, FolderReader } from "@halonicjs/ports";
import { type IntegrationFolderProblem, readIntegrationFolder } from "./integration-folder.ts";
import type {
  GatedRunner,
  GatedStart,
  RunnerStartGate,
  StartInSandbox,
} from "./runner-start-gate.ts";
import type { TrustCheck } from "./trust-service.ts";

/**
 * Why a local integration's runner didn't start for lack of trust.
 *
 * - `workspace-not-trusted`: the workspace's trust check isn't `trusted`.
 * - `not-in-trust`: the trusted content has no integration in this folder.
 * - `code-changed`: a file in the folder changed since the person trusted it.
 * - `folder-refused`: the folder can't be read as an integration now, such
 *   as one with a link in it; `problems` says why.
 */
export type IntegrationTrustReason =
  | "workspace-not-trusted"
  | "not-in-trust"
  | "code-changed"
  | "folder-refused";

/** A local integration's runner didn't start, because the trust a person gave doesn't cover what is in its folder now. */
export class IntegrationNotTrustedError extends Error {
  override readonly name = "IntegrationNotTrustedError";
  readonly folder: string;
  readonly reason: IntegrationTrustReason;
  /** For `folder-refused`, what is wrong with the folder; otherwise empty. */
  readonly problems: readonly IntegrationFolderProblem[];

  constructor(
    folder: string,
    reason: IntegrationTrustReason,
    problems: readonly IntegrationFolderProblem[] = [],
  ) {
    super(notTrustedMessage(folder, reason, problems));
    this.folder = folder;
    this.reason = reason;
    this.problems = problems;
  }
}

/** What {@link TrustedRunnerStart} needs from the host. */
export interface TrustedRunnerStartOptions {
  /** The workspace folder, read without following links. */
  readonly workspace: FolderReader;
  /** For the hash of every file, the same one the trust check uses. */
  readonly digest: Digest;
  /** The gate that picks the sandbox once trust is settled. */
  readonly gate: RunnerStartGate;
}

/** The local integration a start is for. */
export interface TrustedRunnerSubject {
  /** The workspace's trust check, from `TrustService.check`. */
  readonly trust: TrustCheck;
  /** The integration's folder, relative to the workspace, as the trust content names it, such as `integrations/home-station`. */
  readonly folder: string;
}

/**
 * Starts local integrations' runners only with a trust that covers them.
 *
 * @example
 * const starts = new TrustedRunnerStart({ workspace, digest, gate });
 * const gated = await starts.start({ trust, folder }, (sandbox) => startRunner({ ...options, sandbox }));
 * if (gated.run === "needs-yes") showTrustCheck(gated.reason);
 */
export class TrustedRunnerStart {
  readonly #workspace: FolderReader;
  readonly #digest: Digest;
  readonly #gate: RunnerStartGate;

  constructor(options: TrustedRunnerStartOptions) {
    this.#workspace = options.workspace;
    this.#digest = options.digest;
    this.#gate = options.gate;
  }

  /**
   * Checks that `subject.trust` covers the integration in `subject.folder` as
   * it is on disk now, then starts its runner through the start gate.
   *
   * @throws IntegrationNotTrustedError when it doesn't; `startIn` is never called then
   * @throws what the gate or `startIn` throws
   */
  async start<Runner extends GatedRunner>(
    subject: TrustedRunnerSubject,
    startIn: StartInSandbox<Runner>,
  ): Promise<GatedStart<Runner>> {
    await this.#checkTrust(subject);
    return await this.#gate.start(startIn);
  }

  async #checkTrust({ trust, folder }: TrustedRunnerSubject): Promise<void> {
    if (trust.status !== "trusted") {
      throw new IntegrationNotTrustedError(folder, "workspace-not-trusted");
    }
    const trusted = (trust.content.integrations ?? []).find(
      (integration) => integration.folder === folder,
    );
    if (trusted === undefined) {
      throw new IntegrationNotTrustedError(folder, "not-in-trust");
    }
    const now = await readIntegrationFolder(this.#workspace, this.#digest, folder);
    if (!now.ok) {
      throw new IntegrationNotTrustedError(folder, "folder-refused", now.error);
    }
    if (now.value.code !== trusted.code) {
      throw new IntegrationNotTrustedError(folder, "code-changed");
    }
  }
}

function notTrustedMessage(
  folder: string,
  reason: IntegrationTrustReason,
  problems: readonly IntegrationFolderProblem[],
): string {
  switch (reason) {
    case "workspace-not-trusted":
      return `The integration in ${folder} runs code, so it starts only once the workspace is trusted.`;
    case "not-in-trust":
      return `The integration in ${folder} wasn't there when the workspace was trusted, so it doesn't start. Trust the workspace again to run it.`;
    case "code-changed":
      return `A file of the integration in ${folder} changed since the workspace was trusted, so it doesn't start. Trust the workspace again to run it.`;
    case "folder-refused":
      return `The integration in ${folder} doesn't start: ${problems.map((problem) => problem.message).join(" ")}`;
  }
}
