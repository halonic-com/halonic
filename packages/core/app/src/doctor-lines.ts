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
  /** Never `failed`: a workspace that isn't trusted only stops its runs until it is. */
  status: "ok" | "warning";
  /** The workspace's name, such as "acme". */
  name: string;
  /**
   * `trusted`: "trusted on this computer". `new`: "not trusted yet".
   * `changed`: "changed since you trusted it". `unreadable`: the trust
   * record couldn't be read, so Halonic treats it as not trusted.
   * `not-needed`: "test model only, no trust needed".
   */
  trust: WorkspaceTrust;
}

/**
 * The Workspace line of `halonic doctor` (requirement `app.doctor-workspace`).
 * A trusted workspace is ✓, and so is one that needs no trust, as `run`
 * doesn't ask for it there; every other state is a warning, because
 * `halonic trust` fixes it and nothing else is stopped.
 *
 * @param name the workspace's name
 * @param trust the status `TrustService.check` returned
 *
 * @example
 * workspaceLine("acme", "changed");
 * // { check: "workspace", status: "warning", name: "acme", trust: "changed" }
 */
export function workspaceLine(name: string, trust: WorkspaceTrust): WorkspaceLine {
  return {
    check: "workspace",
    status: trust === "trusted" || trust === "not-needed" ? "ok" : "warning",
    name,
    trust,
  };
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
