// The host's word on this computer's sandbox, as the trust check reads it when it opens: whether
// plugin code runs in the sandbox, and the yes to run it without (HAL-3384, the "Runs" line
// design section 7). Studio only shows it and passes the person's yes on; the host checks the
// saved yes again at every start (Julian's condition (a), HAL-1873 section 11).

import { isRunnerUnfencedReason, type RunnerUnfencedReason } from "@halonicjs/app";
import { useCallback, useEffect, useRef, useState } from "react";
import { trustedDay } from "../page/page-text.ts";
import type { TrustFence, UnfencedYes } from "./runs-line.ts";

/**
 * What a plugin start would decide now, as codes: the engine's `UnfencedRunDecision`. `reason`
 * is one of the engine's `runnerUnfencedReasons`, or a code from a newer host Studio doesn't know.
 */
export type UnfencedRunStatus =
  | { readonly run: "fenced" }
  | { readonly run: "allowed"; readonly reason: string; readonly allowedAt: string }
  | { readonly run: "needs-yes"; readonly reason: string }
  | { readonly run: "stopped" };

/**
 * The host's yes to run plugin code without the sandbox: the agent host's `/v1/unfenced-runs`
 * routes on the desktop (`AgentHostUnfencedRuns`).
 */
export interface PluginUnfencedRuns {
  /** What a plugin start would decide now. It throws when the host can't say. */
  readonly status: () => Promise<UnfencedRunStatus>;
  /**
   * Saves the person's yes for `reason`, the reason the check showed. It answers `null` when the
   * reason changed since, and nothing was saved; it throws when the host refuses for another reason.
   */
  readonly allow: (
    reason: RunnerUnfencedReason,
  ) => Promise<{ readonly reason: string; readonly allowedAt: string } | null>;
}

/** The trust check's fence and saved yes, from the host's answer. */
export interface TrustStatus {
  readonly fence: TrustFence;
  readonly yes: UnfencedYes | undefined;
}

const unsaid: TrustStatus = { fence: undefined, yes: undefined };

/**
 * The trust check's fence and saved yes for the host's answer. A reason Studio has no words for,
 * or a yes with no readable day, leaves the check as when the host doesn't say (T9): the dialog
 * asks for no yes it can't name, and the host still decides at every start.
 *
 * @example
 * trustStatusOf({ run: "allowed", reason: "windows", allowedAt: "2026-11-09T10:00:00Z" }, now);
 * // { fence: { state: "not-fenced", reason: "windows" }, yes: { reason: "windows", on: "9 Nov" } }
 */
export function trustStatusOf(status: UnfencedRunStatus, now: Date): TrustStatus {
  switch (status.run) {
    case "fenced":
    case "stopped":
      return { fence: { state: status.run }, yes: undefined };
    case "needs-yes":
      return isRunnerUnfencedReason(status.reason)
        ? { fence: { state: "not-fenced", reason: status.reason }, yes: undefined }
        : unsaid;
    case "allowed": {
      const on = trustedDay(status.allowedAt, now);
      if (!isRunnerUnfencedReason(status.reason) || on === undefined) return unsaid;
      return {
        fence: { state: "not-fenced", reason: status.reason },
        yes: { reason: status.reason, on },
      };
    }
  }
}

/** The status as the open trust check holds it, and how to read it again. */
export interface TrustStatusState extends TrustStatus {
  /** Reads the status again: the check shows Checking until the host answers. */
  readonly read: () => void;
  /** Shows the yes the host just saved, so a second press doesn't save it again. */
  readonly saved: (yes: { readonly reason: string; readonly allowedAt: string }) => void;
}

/**
 * Reads the host's status when the trust check opens, and again on `read`. While the host
 * answers, the fence is `checking` (R4); when it can't answer, or there's no host to ask, the
 * check keeps T9. An answer that comes after a newer read, or after the dialog closed, is dropped.
 */
export function useTrustStatus(unfencedRuns: PluginUnfencedRuns | undefined): TrustStatusState {
  const [status, setStatus] = useState<TrustStatus>(() =>
    unfencedRuns === undefined ? unsaid : { fence: { state: "checking" }, yes: undefined },
  );
  const reads = useRef(0);

  const read = useCallback(() => {
    if (unfencedRuns === undefined) return;
    reads.current += 1;
    const current = reads.current;
    setStatus({ fence: { state: "checking" }, yes: undefined });
    unfencedRuns.status().then(
      (answer) => {
        if (reads.current === current) setStatus(trustStatusOf(answer, new Date()));
      },
      () => {
        if (reads.current === current) setStatus(unsaid);
      },
    );
  }, [unfencedRuns]);

  useEffect(() => {
    read();
    return () => {
      // A late answer belongs to a dialog that's gone.
      reads.current += 1;
    };
  }, [read]);

  const saved = useCallback((yes: { readonly reason: string; readonly allowedAt: string }) => {
    reads.current += 1;
    setStatus(trustStatusOf({ run: "allowed", ...yes }, new Date()));
  }, []);

  return { ...status, read, saved };
}

/**
 * **Trust** with the person's yes (design section 7): saves the yes first, through the host, and
 * trusts only once it's saved. When the reason changed in between, nothing is trusted: the check
 * reads the status again and shows the reason that holds now, with the box to tick again.
 *
 * @returns whether the plugin was trusted
 */
export async function trustWithYes(
  allow: RunnerUnfencedReason | undefined,
  unfencedRuns: PluginUnfencedRuns | undefined,
  status: TrustStatusState,
  trust: () => Promise<void>,
): Promise<boolean> {
  if (allow !== undefined && unfencedRuns !== undefined) {
    const yes = await unfencedRuns.allow(allow);
    if (yes === null) {
      status.read();
      return false;
    }
    status.saved(yes);
  }
  await trust();
  return true;
}
