import type { SandboxStartCheck, SandboxStartResult } from "@halonicjs/app";
import { useCallback, useEffect, useState } from "react";

/** What a press of **Check again** came to: ready, still refused and why, or no answer. */
export type CheckOutcome =
  | { readonly kind: "ready" }
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "failed" };

/**
 * Whether the sandbox can start, for a page whose run controls need it.
 *
 * - `refused`: the reason code while the sandbox can't start; `undefined` while it can, before the
 *   first check answers, and where nothing can check.
 * - `starting`: the first check hasn't answered yet. Until the agent host has started, the shell
 *   holds the check, and a run pressed now would wait without a word (HAL-19614).
 * - `blocksRun`: a refusal or a first check still out; the page's run controls are off while it
 *   holds. A check that can't run leaves the controls as they are, and the engine still refuses the
 *   run itself.
 * - `details`: for `other`, the check's own sentences, for **Copy details** only; never shown.
 * - `checking`: a press of **Check again** is waiting for its answer.
 * - `checkFailed`: the last press couldn't check at all.
 * - `checkAgain`: asks the check now. It never runs anything and never changes a setting.
 */
export interface SandboxStart {
  readonly refused: string | undefined;
  readonly starting: boolean;
  readonly blocksRun: boolean;
  readonly details: string | undefined;
  readonly checking: boolean;
  readonly checkFailed: boolean;
  readonly checkAgain: () => Promise<CheckOutcome>;
}

/**
 * Checks the sandbox once when the page opens, when `needed` (a page whose controls start no
 * program needs no check), and again on each press of **Check again** (requirement
 * `runs.sandbox-cant-run`). `check` is the workspace's `sandboxStartCheckKey`; without it the
 * sandbox counts as able to start.
 *
 * @example
 * const start = useSandboxStart(context.services.find(sandboxStartCheckKey), stepsStartAProgram);
 * <Button unavailable={start.blocksRun ? { reason: firstLineId } : undefined}>Run</Button>
 */
export function useSandboxStart(
  check: SandboxStartCheck | undefined,
  needed: boolean,
): SandboxStart {
  const [refusal, setRefusal] = useState<Refusal>();
  // Starting from the first render, so Run is never on for a frame before the check is asked.
  const [starting, setStarting] = useState(() => check !== undefined && needed);
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);

  useEffect(() => {
    if (check === undefined || !needed) {
      setRefusal(undefined);
      setStarting(false);
      return;
    }
    let current = true;
    setStarting(true);
    check.check().then(
      (result) => {
        if (!current) return;
        setRefusal(refusalOf(result));
        setStarting(false);
      },
      // The first check couldn't run: nothing is disabled on a guess.
      () => {
        if (current) setStarting(false);
      },
    );
    return () => {
      current = false;
    };
  }, [check, needed]);

  const checkAgain = useCallback(async (): Promise<CheckOutcome> => {
    if (check === undefined) return { kind: "ready" };
    setChecking(true);
    try {
      const result = await check.check();
      setCheckFailed(false);
      setRefusal(refusalOf(result));
      return result.ok ? { kind: "ready" } : { kind: "refused", reason: result.reason };
    } catch {
      setCheckFailed(true);
      return { kind: "failed" };
    } finally {
      setChecking(false);
    }
  }, [check]);

  return {
    refused: refusal?.reason,
    starting,
    blocksRun: starting || refusal !== undefined,
    details: refusal?.details,
    checking,
    checkFailed,
    checkAgain,
  };
}

/** What a refused check said: the reason code, and for `other` the check's own sentences. */
type Refusal = { readonly reason: string; readonly details: string | undefined };

function refusalOf(result: SandboxStartResult): Refusal | undefined {
  return result.ok ? undefined : { reason: result.reason, details: result.details };
}
