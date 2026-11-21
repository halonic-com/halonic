import { Button, CloseIcon, TickIcon } from "@halonicjs/studio-kit";
import type { StripProps } from "@halonicjs/studio-shell";
import { useEffect, useSyncExternalStore } from "react";
import { FirstRunService } from "../api.ts";
import type { FirstRun } from "../first-run.ts";
import { type BarMark, type BarStep, barSteps, barWayOut } from "../first-run-bar.ts";
import { barWords } from "../first-run-words.ts";

/**
 * The first-run bar under the top bar (`first-run.bar`): while the first run is on in the open
 * folder, the strip `1 Demo · 2 Model · 3 Run · 4 Approve` at the left and the step's way out at
 * the right. It draws nothing otherwise, so the strip takes no room. It starts the first run the
 * first time it shows in the demo.
 */
export function FirstRunBar({ context }: StripProps) {
  const firstRun = context.services.get(FirstRunService);
  useEffect(() => firstRun.notice(), [firstRun]);
  const state = useFirstRunState(firstRun);
  if (state.kind !== "on" || !firstRun.isOnHere) {
    return null;
  }
  const wayOut = barWayOut(state);
  return (
    <section aria-label={barWords.label} className={barClasses}>
      <ol className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {barSteps(state).map((step) => (
          <StepItem key={step.step} step={step} />
        ))}
      </ol>
      {wayOut === "skip" ? (
        <div className="ms-auto shrink-0">
          <Button variant="ghost" size="sm" onClick={() => firstRun.send({ kind: "left" })}>
            {barWords.skip}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** The first run's state, read again at every change. */
export function useFirstRunState(firstRun: FirstRun) {
  return useSyncExternalStore(
    (listener) => firstRun.subscribe(listener),
    () => firstRun.state,
  );
}

const barClasses =
  "flex min-h-10 shrink-0 flex-wrap items-center gap-3 border-b border-border bg-surface-subtle px-4 py-1.5 text-small";

function StepItem({ step }: { readonly step: BarStep }) {
  const name = barWords.steps[step.step];
  return (
    <li
      className="flex items-center gap-1.5"
      aria-current={step.mark === "current" || step.mark === "failed" ? "step" : undefined}
    >
      <StepMark mark={step.mark} />
      <span className={step.mark === "todo" ? "text-fg-muted" : "text-fg"}>
        {step.number} {name}
      </span>
      {spokenMark(step.mark)}
    </li>
  );
}

/** What a screen reader hears after a done or failed step's name; the mark itself is hidden. */
function spokenMark(mark: BarMark) {
  if (mark === "done") return <span className="sr-only">, {barWords.done}</span>;
  if (mark === "failed") return <span className="sr-only">, {barWords.failed}</span>;
  return null;
}

const markClasses = "grid size-4 shrink-0 place-items-center rounded-full *:size-3";

/** The 16px mark before a step: a tick, the ring-and-dot, a red cross, or an empty ring. */
function StepMark({ mark }: { readonly mark: BarMark }) {
  switch (mark) {
    case "done":
      return (
        <span aria-hidden="true" className={`${markClasses} bg-success text-on-success`}>
          <TickIcon />
        </span>
      );
    case "failed":
      return (
        <span aria-hidden="true" className={`${markClasses} bg-danger text-on-danger`}>
          <CloseIcon />
        </span>
      );
    case "current":
      return (
        <span aria-hidden="true" className={`${markClasses} border-2 border-accent`}>
          <span className="size-1.5! rounded-full bg-accent" />
        </span>
      );
    case "todo":
      return <span aria-hidden="true" className={`${markClasses} border border-border-strong`} />;
  }
}
