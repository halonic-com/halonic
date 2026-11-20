// The Workspace, Sandbox and Disk lines of `halonic doctor`, without the
// words: which mark each line gets and the facts the CLI words it from
// (cli-output 3.7). The Harnesses line and the summary are in
// `doctor-checks.ts`.

import type { SandboxCapabilities, SandboxCheck, SandboxUnavailableReason } from "@halonicjs/ports";
import type { DoctorLine } from "./doctor-checks.ts";
import type { Resources } from "./resource-report.ts";
import type { TrustCheck } from "./trust-service.ts";

/**
 * Whether this computer trusts the workspace, as `TrustService.check` found
 * it, or `not-needed` when a run there can only reach the test model, so it
 * needs no trust (HAL-6007).
 */
export type WorkspaceTrust = TrustCheck["status"] | "not-needed";

/** The Workspace line: shown only inside a workspace. */
export interface WorkspaceLine extends DoctorLine {
  check: "workspace";
  /**
   * `failed` only when files have problems: a workspace that isn't trusted
   * only stops its runs until it is.
   */
  status: "ok" | "warning" | "failed";
  /** The workspace's name, such as "acme". */
  name: string;
  /**
   * `trusted`: "trusted on this computer". `new`: "not trusted yet".
   * `changed`: "changed since you trusted it". `unreadable`: the trust
   * record couldn't be read, so Halonic treats it as not trusted.
   * `not-needed`: "test model only, no trust needed".
   */
  trust: WorkspaceTrust;
  /**
   * On WSL, the Windows drive the workspace is on, such as "/mnt/c": runs
   * there are slow, and edits made from Windows aren't seen (HAL-6517).
   * Left out when it isn't on one.
   */
  windowsDrive?: string;
  /**
   * How many errors `halonic validate` finds in the workspace's files, only
   * when there are any. Each leaves a file out of the workspace, so no run
   * starts there until they are fixed (HAL-6613).
   */
  fileProblems?: number;
  /**
   * The most files Studio's folder watch looks at, such as 50,000, only when
   * the workspace has more: Studio doesn't watch it, so it won't show
   * changes made outside Halonic as they happen (HAL-12295).
   */
  tooManyFilesToWatch?: number;
}

/** What else doctor found about the workspace, besides its trust. */
export interface WorkspaceFindings {
  /** The Windows drive it is on under WSL, such as "/mnt/c". */
  windowsDrive?: string | undefined;
  /** The errors in the workspace's files, as `halonic validate` counts them. */
  fileProblems?: number | undefined;
  /** Studio's folder watch limit, when the workspace has more files than it. */
  tooManyFilesToWatch?: number | undefined;
}

/**
 * The Workspace line of `halonic doctor` (requirement `app.doctor-workspace`).
 * A workspace whose files have errors fails, because `run` refuses it until
 * they are fixed. Otherwise a trusted workspace is ✓, and so is one that
 * needs no trust, as `run` doesn't ask for it there; every other state is a
 * warning, because `halonic trust` fixes it and nothing else is stopped. A
 * workspace on a Windows drive under WSL is a warning too (requirement
 * `app.doctor-workspace-drive`): it works, only slowly. So is one with
 * more files than Studio watches (requirement `app.doctor-workspace-watch`):
 * it works, but Studio won't show changes made outside Halonic.
 *
 * @param name the workspace's name
 * @param trust the status `TrustService.check` returned
 * @param findings the Windows drive it is on, the errors in its files and
 *   Studio's watch limit, when there are any
 *
 * @example
 * workspaceLine("acme", "changed");
 * // { check: "workspace", status: "warning", name: "acme", trust: "changed" }
 * workspaceLine("acme", "new", { fileProblems: 2 });
 * // { check: "workspace", status: "failed", name: "acme", trust: "new", fileProblems: 2 }
 * workspaceLine("acme", "trusted", { tooManyFilesToWatch: 50_000 });
 * // { check: "workspace", status: "warning", name: "acme", trust: "trusted", tooManyFilesToWatch: 50000 }
 */
export function workspaceLine(
  name: string,
  trust: WorkspaceTrust,
  findings: WorkspaceFindings = {},
): WorkspaceLine {
  const { windowsDrive, fileProblems = 0, tooManyFilesToWatch } = findings;
  return {
    check: "workspace",
    status: workspaceStatus(trust, findings),
    name,
    trust,
    ...(windowsDrive === undefined ? {} : { windowsDrive }),
    ...(fileProblems === 0 ? {} : { fileProblems }),
    ...(tooManyFilesToWatch === undefined ? {} : { tooManyFilesToWatch }),
  };
}

function workspaceStatus(
  trust: WorkspaceTrust,
  { windowsDrive, fileProblems = 0, tooManyFilesToWatch }: WorkspaceFindings,
): WorkspaceLine["status"] {
  if (fileProblems > 0) {
    return "failed";
  }
  const trustOk = trust === "trusted" || trust === "not-needed";
  const warned = windowsDrive !== undefined || tooManyFilesToWatch !== undefined;
  return trustOk && !warned ? "ok" : "warning";
}

/** The Sandbox line. */
export type SandboxLine =
  | (DoctorLine & {
      check: "sandbox";
      status: "ok";
      /** "ready · *kind of sandbox*": how strong the fence is and how files reach it. */
      capabilities: SandboxCapabilities;
    })
  | (DoctorLine & {
      check: "sandbox";
      status: "failed";
      /**
       * The code the CLI words the reason and the fix from (cli-output 3.8's
       * table). The check's own `missing` sentences aren't here: they are for
       * logs and support, not for people (cli-output 3.8, revision 7).
       */
      reason: SandboxUnavailableReason;
      /** For `--debug` only, as one dimmed line after `More:`. */
      missing: string[];
    });

/**
 * The Sandbox line of `halonic doctor` (requirement `app.doctor-sandbox`).
 * A sandbox that can't start is ✕, because agents set to run in it won't
 * start: so on most CI runners `doctor` exits 1 (cli-output 3.7).
 *
 * The approved ! state ("needs setting up" on Windows, D44 (a)) has no
 * reason in the `Sandbox` port yet, so the line is ✓ or ✕ for now.
 *
 * @param check what `Sandbox.check()` returned
 * @param capabilities what `Sandbox.capabilities()` returned
 *
 * @example
 * sandboxLine({ ok: false, reason: "bubblewrap-missing", missing: ["bwrap not found"] }, capabilities);
 * // { check: "sandbox", status: "failed", reason: "bubblewrap-missing", missing: ["bwrap not found"] }
 */
export function sandboxLine(check: SandboxCheck, capabilities: SandboxCapabilities): SandboxLine {
  if (check.ok) return { check: "sandbox", status: "ok", capabilities };
  return { check: "sandbox", status: "failed", reason: check.reason, missing: [...check.missing] };
}

/**
 * What is wrong with the Node.js that runs Halonic, as the host found it
 * (HAL-6517, from the WSL2 first-run research on HAL-6504):
 *
 * - `windows-node-in-wsl`: Windows' Node.js runs Halonic in a WSL folder,
 *   as Windows reaches it, instead of Node.js inside WSL.
 * - `windows-pnpm`: inside WSL, the `pnpm` on the `PATH` is Windows' one, at
 *   `pnpm`, under `/mnt/`.
 */
export type NodeProblem =
  | { problem: "windows-node-in-wsl" }
  | { problem: "windows-pnpm"; pnpm: string };

/** The Node.js line: shown only when the host found a {@link NodeProblem}. */
export type NodeLine = DoctorLine & {
  check: "node";
  /** Never `failed`: Halonic still starts, it only runs in the wrong place. */
  status: "warning";
} & NodeProblem;

/**
 * The Node.js line of `halonic doctor` (requirement `app.doctor-node`): a
 * warning with the problem the host found, or no line without one.
 *
 * @example
 * nodeLine({ problem: "windows-node-in-wsl" });
 * // { check: "node", status: "warning", problem: "windows-node-in-wsl" }
 * nodeLine(null); // undefined
 */
export function nodeLine(problem: NodeProblem | null): NodeLine | undefined {
  if (problem === null) return undefined;
  return { check: "node", status: "warning", ...problem };
}

/**
 * What is wrong with the network settings, as the host read them without
 * any network call (HAL-14262), with the variable the setting came from,
 * such as `HTTPS_PROXY`:
 *
 * - `proxy-not-http`: the proxy is another kind, such as `https` or
 *   `socks5`, and Halonic only uses `http` proxies.
 * - `proxy-unusable`: the proxy setting can't be used, for `reason`, the
 *   host's own sentence.
 */
export type NetworkProblem =
  | { problem: "proxy-not-http"; variable: string; scheme: string }
  | { problem: "proxy-unusable"; variable: string; reason: string };

/** The Network line: shown only when the host found a {@link NetworkProblem}. */
export type NetworkLine = DoctorLine & {
  check: "network";
  /** A warning: Halonic still starts, only its calls to model providers fail. */
  status: "warning";
} & NetworkProblem;

/**
 * The Network line of `halonic doctor` (requirement `app.doctor-network`): a
 * warning with the problem the host found, or no line without one.
 *
 * @example
 * networkLine({ problem: "proxy-not-http", variable: "HTTPS_PROXY", scheme: "https" });
 * // { check: "network", status: "warning", problem: "proxy-not-http", variable: "HTTPS_PROXY", scheme: "https" }
 * networkLine(null); // undefined
 */
export function networkLine(problem: NetworkProblem | null): NetworkLine | undefined {
  if (problem === null) return undefined;
  return { check: "network", status: "warning", ...problem };
}

/** What Halonic's own data takes on the disk. */
export interface DataSpace {
  /** All of Halonic's data folders together. */
  bytes: number;
  /** The run logs' part of it: "(run logs 1.1 GB)". */
  runLogBytes: number;
  /**
   * False when the probe stopped counting a folder at its limit, so the
   * numbers are at least this much.
   */
  complete: boolean;
}

/** The Disk line. */
export interface DiskLine extends DoctorLine {
  check: "disk";
  /** Never `failed`: Halonic still runs on a nearly full disk, until it can't write a run log. */
  status: "ok" | "warning";
  /** The free space on the drive of Halonic's data, or `null` when it couldn't be read. */
  freeBytes: number | null;
  /** `null` when a folder's size couldn't be read: a part would understate the whole. */
  data: DataSpace | null;
  /**
   * `low`: "Low on disk space: 0.8 GB free" (under 1 GiB, as the status bar).
   * `unreadable`: the free space couldn't be read, so Halonic can't say it's
   * enough. `null` when the line is ✓.
   */
  problem: "low" | "unreadable" | null;
}

/**
 * The Disk line of `halonic doctor` (requirement `app.doctor-disk`), from
 * the resource report's disk and data parts.
 *
 * @example
 * diskLine({ disk: ok({ freeBytes: 860_000_000, low: true }), data: [] });
 * // { check: "disk", status: "warning", freeBytes: 860000000,
 * //   data: { bytes: 0, runLogBytes: 0, complete: true }, problem: "low" }
 */
export function diskLine(resources: Pick<Resources, "disk" | "data">): DiskLine {
  const { disk } = resources;
  const problem = diskProblem(disk);
  return {
    check: "disk",
    status: problem === null ? "ok" : "warning",
    freeBytes: disk.ok ? disk.value.freeBytes : null,
    data: dataSpace(resources.data),
    problem,
  };
}

function diskProblem(disk: Resources["disk"]): DiskLine["problem"] {
  if (!disk.ok) return "unreadable";
  return disk.value.low ? "low" : null;
}

/** Adds up the data folders, or `null` when one of them couldn't be read. */
function dataSpace(folders: Resources["data"]): DataSpace | null {
  const space: DataSpace = { bytes: 0, runLogBytes: 0, complete: true };
  for (const folder of folders) {
    if (!folder.size.ok) return null;
    const { bytes, complete } = folder.size.value;
    space.bytes += bytes;
    if (folder.kind === "run-logs") space.runLogBytes += bytes;
    space.complete &&= complete;
  }
  return space;
}
