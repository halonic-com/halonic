// The trust check a sandbox backend passes before Halonic uses it: its own
// `check()`, then one short canary session under the real policy
// (docs/adr/2026-11-10-mxc-sandbox-backend.md, "The trust check"). Today only
// MXC has one. It reports codes, never sentences: Studio and the CLI word
// them from the board-approved design (HAL-3290).

import type { Sandbox, SandboxProfile, SandboxSession } from "@halonicjs/ports";

/**
 * The probes that find a leak, in the order the trust check reports them:
 * when more than one gets through, the first one here.
 *
 * - `file-readable`: a hidden file, or a denied file inside a readable folder, could be read.
 * - `file-writable`: a file outside the writable folders could be created, changed or removed.
 * - `port-reachable`: a local port other than the bridge could be reached, either way.
 * - `internet-reachable`: an address outside this computer could be reached.
 * - `dns-reachable`: a lookup sent straight to a public DNS server got an answer.
 */
export const trustCheckLeaks = [
  "file-readable",
  "file-writable",
  "port-reachable",
  "internet-reachable",
  "dns-reachable",
] as const;

/** A probe that found a leak: one of {@link trustCheckLeaks}. */
export type TrustCheckLeak = (typeof trustCheckLeaks)[number];

/**
 * Every reason a trust check fails, in the order it reports them. The list
 * is closed: a new reason is a change here, through a task that names it,
 * and it needs words in the design before Studio shows it.
 *
 * The leaks come first, then:
 * - `too-strict`: nothing leaked, but a control failed: the box blocked
 *   something a real run must do (HAL-2546's real-PC check). The leak probes
 *   mean nothing in a box that blocks allowed reads, and runs in it would break.
 * - `did-not-start`: the sandbox's check passed, but the box or the probe program didn't start.
 * - `other`: anything else, such as the fence proof failing with no probe to
 *   say which, or the time limit. `missing` says what.
 */
export const trustCheckFailures = [
  ...trustCheckLeaks,
  "too-strict",
  "did-not-start",
  "other",
] as const;

/** Why a trust check failed: one of {@link trustCheckFailures}. */
export type TrustCheckFailure = (typeof trustCheckFailures)[number];

/**
 * What the probe program found in the canary session.
 *
 * `started: false`: the probe program didn't start, so nothing was probed.
 * Otherwise `leaks` lists every probe that got through, and `controls` the
 * two things a real run must be able to do in the box.
 */
export type CanaryFindings =
  | { started: false; missing: readonly string[] }
  | {
      started: true;
      /** Every probe that got through, in any order. */
      leaks: readonly TrustCheckLeak[];
      controls: {
        /** A file in a read-only allowed folder could be read. */
        readOnlyFileRead: boolean;
        /** Node loaded a script from the read-write working folder. */
        workFolderScriptLoaded: boolean;
      };
      /**
       * A never-used name, looked up through the operating system's DNS
       * service, got out. A known limit of MXC that `doctor` shows: it never
       * fails the check, or MXC would be off on every machine.
       */
      nameLookupsLeave: boolean;
      /** What failed, one plain sentence each, for logs and support. */
      missing: readonly string[];
    };

/**
 * A backend's canary: the profile and the probe program of its trust check.
 * The backend's adapter builds it, because only the adapter knows its
 * policy, and only the host knows where Halonic's folders are.
 */
export interface TrustCanary {
  /**
   * The canary session's profile. It uses the same kinds of paths as a real
   * run, the project folder and Halonic's own folder under `%LOCALAPPDATA%`,
   * never a fresh temporary folder, so the check fails where a real run
   * would. Its time limit is the check's.
   */
  profile(): Promise<SandboxProfile>;
  /**
   * Runs the probe program in the open canary session and reports what it
   * found. It must settle within the profile's `timeLimitMs`, and throw when
   * the time runs out, so a canary that hangs ends as `other`.
   */
  probe(session: SandboxSession): Promise<CanaryFindings>;
}

/**
 * What a trust check found. When it failed, `reason` is one code and
 * `missing` the sentences behind it, for logs and support, not for people.
 */
export type TrustCheckResult =
  | { passed: true; nameLookupsLeave: boolean }
  | { passed: false; reason: TrustCheckFailure; missing: string[] };

/**
 * Runs a backend's trust check: `check()`, then a canary session that is
 * opened, has its fence proof read and its probes run, and is closed.
 * Never throws: whatever goes wrong is a failed check, with its message in
 * `missing`. The canary profile's time limit bounds the session; core has no
 * timers of its own.
 *
 * @example
 * const result = await runTrustCheck(mxc.sandbox, mxc.canary);
 * // { passed: false, reason: "too-strict", missing: ["can't read the read-only folder"] }
 */
export async function runTrustCheck(
  sandbox: Pick<Sandbox, "check" | "open">,
  canary: TrustCanary,
): Promise<TrustCheckResult> {
  const check = await sandbox.check();
  if (!check.ok) return failed("other", check.missing);

  let profile: SandboxProfile;
  try {
    profile = await canary.profile();
  } catch (error) {
    return failed("other", [messageOf(error)]);
  }

  let session: SandboxSession;
  try {
    session = await sandbox.open(profile);
  } catch (error) {
    return failed("did-not-start", [messageOf(error)]);
  }

  try {
    return verdict(session, await canary.probe(session));
  } catch (error) {
    return failed("other", [messageOf(error)]);
  } finally {
    await session.close();
  }
}

/** The verdict from the fence proof and the probes: a leak first, then a failed control. */
function verdict(session: SandboxSession, findings: CanaryFindings): TrustCheckResult {
  if (!findings.started) return failed("did-not-start", findings.missing);

  const leak = trustCheckLeaks.find((code) => findings.leaks.includes(code));
  if (leak !== undefined) return failed(leak, findings.missing);

  const { readOnlyFileRead, workFolderScriptLoaded } = findings.controls;
  if (!readOnlyFileRead || !workFolderScriptLoaded) return failed("too-strict", findings.missing);

  // A fence proof that failed with no probe to say which is still a failure.
  const fence = session.fence;
  if (fence.state === "not-fenced") return failed("other", [fence.reason, ...findings.missing]);

  return { passed: true, nameLookupsLeave: findings.nameLookupsLeave };
}

function failed(reason: TrustCheckFailure, missing: readonly string[]): TrustCheckResult {
  return { passed: false, reason, missing: [...missing] };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
