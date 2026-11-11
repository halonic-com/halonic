// The trust check in front of every start of a local integration's runner
// (trust build plan item 8a, HAL-188; I5 design section 5, HAL-958). A
// runner starts only when the workspace's trust check is `trusted`, its
// trusted content covers this integration's folder, the folder's files hash
// now to the `code` that was trusted, and the settings it starts with give
// the addresses that were trusted. Only then does the start gate pick the
// sandbox. Without all of that it throws and starts no process: no
// sandbox session, no Node, no bridge.
//
// The folder is hashed again at every start, the restart after an idle stop
// included, because files can change while Halonic runs and the trust check
// was made earlier. A setting such as the URL of a `{ fromSetting }` host
// changes no file, so it is compared on its own. The fence status is read by the gate per run and is
// never part of the trust content, so a saved yes for running without the
// fence can never stand in for trust.

import type { Digest, FolderReader } from "@halonicjs/ports";
import { canonicalJson, posixPath } from "@halonicjs/std";
import { integrationSettingAddresses } from "@halonicjs/workspace";
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
 * - `settings-changed`: a setting a `{ fromSetting }` host reads holds
 *   another address than the person trusted, or was set or cleared since.
 * - `folder-refused`: the folder can't be read as an integration now, such
 *   as one with a link in it; `problems` says why.
 */
export type IntegrationTrustReason =
  | "workspace-not-trusted"
  | "not-in-trust"
  | "code-changed"
  | "settings-changed"
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
  /**
   * The integration's folder, relative to the workspace, such as
   * `integrations/home-station`. It is normalised as the trust content's
   * folder is, so `integrations/home-station/` names the same one.
   */
  readonly folder: string;
  /**
   * The workspace's settings for the integration that the runner starts
   * with, such as `{ url: "http://192.168.1.20:8123" }`; `{}` while a
   * workspace has none. The addresses its `{ fromSetting }` hosts read from
   * them must be the trusted ones: a setting left unset stays unset, and its
   * host then reaches nothing.
   */
  readonly settings: Readonly<Record<string, unknown>>;
}

/**
 * Starts local integrations' runners only with a trust that covers them.
 *
 * @example
 * const starts = new TrustedRunnerStart({ workspace, digest, gate });
 * const gated = await starts.start({ trust, folder, settings }, (sandbox) => startRunner({ ...options, sandbox }));
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

  async #checkTrust(subject: TrustedRunnerSubject): Promise<void> {
    const { trust, settings } = subject;
    const folder = normalizedFolder(subject.folder);
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
    // The code is the trusted code, so the sheet is the trusted sheet, and
    // both lists of addresses have the same settings in the same order.
    const addresses = integrationSettingAddresses(now.value.sheet, settings);
    if (canonicalJson(addresses) !== canonicalJson(trusted.addresses)) {
      throw new IntegrationNotTrustedError(folder, "settings-changed");
    }
  }
}

/** `folder` as the trust content names it: normalised, without a trailing `/`. */
function normalizedFolder(folder: string): string {
  return posixPath.normalize(folder).replace(/\/+$/, "");
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
    case "settings-changed":
      return `An address the integration in ${folder} talks to, from its settings, changed since the workspace was trusted, so it doesn't start. Trust the workspace again to run it.`;
    case "folder-refused":
      return `The integration in ${folder} doesn't start: ${problems.map((problem) => problem.message).join(" ")}`;
  }
}
