import type { SandboxStartCheck } from "@halonicjs/app";
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
 *   first check answers, and where nothing can check. Only a refusal disables a control: a check
 *   that can't run leaves the controls as they are, and the engine still refuses the run itself.
 * - `checking`: a press of **Check again** is waiting for its answer.
 * - `checkFailed`: the last press couldn't check at all.
 * - `checkAgain`: asks the check now. It never runs anything and never changes a setting.
 */
export interface SandboxStart {
  readonly refused: string | undefined;
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
 * <Button unavailable={start.refused === undefined ? undefined : { reason: firstLineId }}>Run</Button>
 */
export function useSandboxStart(
  check: SandboxStartCheck | undefined,
  needed: boolean,
): SandboxStart {
  const [refused, setRefused] = useState<string>();
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);

  useEffect(() => {
    if (check === undefined || !needed) {
      setRefused(undefined);
      return;
    }
    let current = true;
    check.check().then(
      (result) => {
        if (current) setRefused(result.ok ? undefined : result.reason);
      },
      // The first check couldn't run: nothing is disabled on a guess.
      () => undefined,
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
      setRefused(result.ok ? undefined : result.reason);
      return result.ok ? { kind: "ready" } : { kind: "refused", reason: result.reason };
    } catch {
      setCheckFailed(true);
      return { kind: "failed" };
    } finally {
      setChecking(false);
    }
  }, [check]);

  return { refused, checking, checkFailed, checkAgain };
}
