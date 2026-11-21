import { type SandboxStartCheck, sandboxStartWords } from "@halonicjs/app";
import type { RunEvent, RunSummary } from "@halonicjs/events";
import { Callout, type CalloutHandle, ExternalLink } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import { runPageWords } from "../run-words.ts";
import type { RunAgain } from "./run-again.ts";

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
 * The agent that was about to start: the one `run.failed` names, else, for a run logged before it
 * did, the last top-level `agent.started`; `undefined` when neither names one. In a parallel state
 * several agents start, so the last start can be the wrong one.
 */
export function sandboxNotReadyAgent(log: readonly RunEvent[] | undefined): string | undefined {
  const refused = log?.findLast((event) => event.type === "run.failed")?.agent;
  if (refused !== undefined) return refused;
  return log?.findLast(
    (event): event is Extract<RunEvent, { type: "agent.started" }> =>
      event.type === "agent.started" && event.parent === undefined,
  )?.agent;
}

/**
 * The failed banner of a run the sandbox check refused (requirement
 * `runs.run-view.sandbox-not-ready`): what is wrong and the fix, from the one catalogue, then
 * "Nothing ran.", **Check again** and a link to the guide named for the reason. A passing check says the sandbox works
 * and turns the button into **Run again**; nothing runs by itself. Without a `check` (a served
 * page) there is no button. The button stays, busy, while a check runs, so it keeps focus; the
 * answer is said through `announce`, and a passing check moves focus to the banner.
 */
export function SandboxNotReadyBanner({
  name,
  reason,
  check,
  announce,
  phone,
  runAgain,
}: {
  /** The agent that didn't start, or the workflow when the log names no agent. */
  readonly name: string;
  readonly reason: string;
  readonly check: SandboxStartCheck | undefined;
  readonly announce?: ((line: string) => void) | undefined;
  readonly phone: boolean;
  /** The page's Run again, offered once a check passes; absent when the page can't run again. */
  readonly runAgain?: RunAgain | undefined;
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
          ? runPageWords.sandboxReady(name)
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
  const action = ready
    ? runAgain && { label: runPageWords.runAgain, onClick: runAgain.start }
    : check && { label: runPageWords.sandboxCheckAgain, onClick: again };
  return (
    <section aria-label={runPageWords.failedName}>
      <Callout
        tone={ready ? "info" : "danger"}
        {...(action === undefined ? {} : { action })}
        {...(ready ? { announce: "focus" as const, ref: banner } : {})}
      >
        <span className="block">{runPageWords.sandboxNotReady(name)}</span>
        <span className="block">{words.reason}</span>
        <span className="block">{phone ? words.phoneFix : words.calloutFix}</span>
        <span className="block">{runPageWords.sandboxNothingRan}</span>
        {ready ? <span className="block">{runPageWords.sandboxReady(name)}</span> : null}
        {checked?.kind === "failed" ? (
          <span className="block">{runPageWords.sandboxCheckFailed}</span>
        ) : null}
        <span className="block">
          <ExternalLink href={`${runPageWords.sandboxDocsBase}/${words.docsKey}`}>
            {words.docsName}
          </ExternalLink>
        </span>
      </Callout>
    </section>
  );
}
