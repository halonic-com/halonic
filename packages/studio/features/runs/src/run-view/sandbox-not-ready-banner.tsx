import { type SandboxStartCheck, sandboxStartWords } from "@halonicjs/app";
import type { RunEvent, RunSummary } from "@halonicjs/events";
import { Callout } from "@halonicjs/studio-kit";
import { useState } from "react";
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
 * there is no button.
 */
export function SandboxNotReadyBanner({
  workflow,
  reason,
  check,
  phone,
}: {
  readonly workflow: string;
  readonly reason: string;
  readonly check: SandboxStartCheck | undefined;
  readonly phone: boolean;
}) {
  const [checked, setChecked] = useState<Checked>();
  const [checking, setChecking] = useState(false);

  const again = async () => {
    if (check === undefined) return;
    setChecking(true);
    try {
      const result = await check.check();
      setChecked(result.ok ? { kind: "ready" } : { kind: "refused", reason: result.reason });
    } catch {
      setChecked({ kind: "failed" });
    } finally {
      setChecking(false);
    }
  };

  const words = sandboxStartWords(checked?.kind === "refused" ? checked.reason : reason);
  const ready = checked?.kind === "ready";
  const action =
    check === undefined || ready
      ? undefined
      : {
          label: checking ? runPageWords.sandboxChecking : runPageWords.sandboxCheckAgain,
          onClick: () => {
            if (!checking) void again();
          },
        };
  return (
    <section aria-label={runPageWords.failedName}>
      <Callout tone={ready ? "info" : "danger"} {...(action === undefined ? {} : { action })}>
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
