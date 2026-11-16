import { type SandboxStartCheck, sandboxStartWords } from "@halonicjs/app";
import type { RunEvent, RunSummary } from "@halonicjs/events";
import { Callout, type CalloutHandle } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import { runPageWords } from "../run-words.ts";

/**
 * The reason code of a run the sandbox check refused, from `run.failed`; `undefined` for any other
 * run, and while the log isn't read, so the page keeps its general banner. A missing or unknown
 * code reads as `other` in the words.
 */
export function sandboxNotReadyReason(
  summary: RunSummary,
  log: readonly RunEvent[] | undefined,
): string | undefined {
  if (summary.status !== "failed" || summary.reason !== "sandbox-not-ready" || log === undefined) {
    return undefined;
  }
  const failed = log.findLast((event) => event.type === "run.failed");
  return failed?.sandboxReason ?? "other";
}

/** What the last check came to: it passed, the sandbox still can't start (and why), or it couldn't run. */
type Checked =
  | { readonly kind: "ready" }
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "failed" };

/**
 * The failed banner of a run the sandbox check refused (requirement
 * `runs.run-view.sandbox-not-ready`): what is wrong and the fix, from the one catalogue, then
 * "Nothing ran." and **Check again**. A passing check says to run again and drops the button;
 * nothing runs by itself and there is no way to run anyway. Without a `check` (a served page)
 * there is no button. The button stays, busy, while a check runs, so it keeps focus; the answer is
 * said through `announce`, and a passing check, which drops the button, moves focus to the banner.
 */
export function SandboxNotReadyBanner({
  workflow,
  reason,
  check,
  announce,
  phone,
}: {
  readonly workflow: string;
  readonly reason: string;
  readonly check: SandboxStartCheck | undefined;
  readonly announce?: ((line: string) => void) | undefined;
  readonly phone: boolean;
}) {
  const [checked, setChecked] = useState<Checked>();
  // The newest code a check gave. A check that can't run keeps it rather than going back to the run's.
  const [lastReason, setLastReason] = useState<string>();
  const banner = useRef<CalloutHandle>(null);

  const again = async () => {
    if (check === undefined) return;
    try {
      const result = await check.check();
      if (!result.ok) setLastReason(result.reason);
      setChecked(result.ok ? { kind: "ready" } : { kind: "refused", reason: result.reason });
      announce?.(
        result.ok
          ? runPageWords.sandboxCheckedReady
          : runPageWords.sandboxCheckedRefused(sandboxStartWords(result.reason).reason),
      );
    } catch {
      setChecked({ kind: "failed" });
      announce?.(runPageWords.sandboxCheckFailed);
    }
  };

  const words = sandboxStartWords(lastReason ?? reason);
  const ready = checked?.kind === "ready";
  // The button is gone once the sandbox is ready, so focus goes to the banner that says so.
  useEffect(() => {
    if (ready) banner.current?.focus();
  }, [ready]);
  const action =
    check === undefined || ready
      ? undefined
      : { label: runPageWords.sandboxCheckAgain, onClick: again };
  return (
    <section aria-label={runPageWords.failedName}>
      <Callout
        tone={ready ? "info" : "danger"}
        {...(action === undefined ? {} : { action })}
        {...(ready ? { announce: "focus" as const, ref: banner } : {})}
      >
        <span className="block">{runPageWords.sandboxNotReady(workflow)}</span>
        <span className="block">{words.reason}</span>
        <span className="block">{phone ? words.phoneFix : words.calloutFix}</span>
        <span className="block">{runPageWords.sandboxNothingRan}</span>
        {ready ? <span className="block">{runPageWords.sandboxReady}</span> : null}
        {checked?.kind === "failed" ? (
          <span className="block">{runPageWords.sandboxCheckFailed}</span>
        ) : null}
      </Callout>
    </section>
  );
}
