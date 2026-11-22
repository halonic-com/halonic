import { Button, CloseIcon, TickIcon, usePresentation } from "@halonicjs/studio-kit";
import { failureLine, pageHeading, type StripProps } from "@halonicjs/studio-shell";
import { useEffect, useState, useSyncExternalStore } from "react";
import { FirstRunService } from "../api.ts";
import { type FirstRun, SUPPORT_HUB, SUPPORT_WORKFLOW } from "../first-run.ts";
import { type BarMark, type BarStep, barSteps, barWayOut } from "../first-run-bar.ts";
import { type FirstRunStart, FirstRunStartService } from "../first-run-start.ts";
import { barWords } from "../first-run-words.ts";

/**
 * The first-run bar under the top bar (`first-run.bar`): while the first run is on in the open
 * folder, the strip `1 Demo · 2 Model · 3 Run · 4 Approve` at the left and the step's way out at
 * the right. It draws nothing otherwise, so the strip takes no room. It starts the first run the
 * first time it shows in the demo.
 */
export function FirstRunBar({ context }: StripProps) {
  const firstRun = context.services.get(FirstRunService);
  const start = context.services.get(FirstRunStartService);
  useEffect(() => firstRun.notice(), [firstRun]);
  const state = useFirstRunState(firstRun);
  const cancelled = useLastCancelled(firstRun, start);
  // On a phone the strip can wrap, and a rail would start a line, so it has none there.
  const rails = usePresentation() !== "phone";
  if (state.kind !== "on" || !firstRun.isOnHere) {
    return null;
  }
  const wayOut = barWayOut(state, start.canCancel);
  // Said at Run until another run starts; the button goes as soon as the engine answers.
  const saysCancelled = cancelled && state.step === "run" && state.failed !== true;
  const backToSupportReply = () =>
    context.openItem?.({ kind: "workflow", hub: SUPPORT_HUB, id: SUPPORT_WORKFLOW });
  return (
    <section aria-label={barWords.label} className={barClasses}>
      <ol className={`flex min-w-0 flex-wrap items-center gap-y-1 ${rails ? "" : "gap-x-3"}`}>
        {barSteps(state).map((step, index, steps) => (
          <StepItem
            key={step.step}
            step={step}
            railAfter={rails ? steps[index - 1]?.mark : undefined}
          />
        ))}
      </ol>
      {wayOut === "skip" ? (
        <div className="ms-auto shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              firstRun.send({ kind: "left" });
              focusPageStart();
            }}
          >
            {barWords.skip}
          </Button>
        </div>
      ) : null}
      {wayOut === "cancel" && !saysCancelled ? (
        <CancelRun start={start} onCancelled={backToSupportReply} />
      ) : null}
      {/* Always there, so a screen reader hears the line when it fills. */}
      <p role="status" className={saysCancelled ? "ms-auto shrink-0 text-fg-muted" : "sr-only"}>
        {saysCancelled ? barWords.cancelled : ""}
      </p>
    </section>
  );
}

/**
 * **Cancel run** (first-run-flow 3.4, `first-run.run`): ends the run as cancelled and goes back to
 * Support reply's page, where the guide card reads **Run again**, and the bar says "Run
 * cancelled." in its place. Busy until the engine answers; when it can't cancel, the bar says
 * why and the button stays.
 */
function CancelRun({
  start,
  onCancelled,
}: {
  readonly start: FirstRunStart;
  readonly onCancelled: () => void;
}) {
  const [failed, setFailed] = useState<string>();
  const [busy, setBusy] = useState(false);
  const cancel = async () => {
    setFailed(undefined);
    setBusy(true);
    try {
      await start.cancel();
      onCancelled();
    } catch (error) {
      console.error("Cancel run", error);
      // The bar has room for one way out, so no Copy details: the error stays in the log (C671-45).
      setFailed(failureLine(barWords.cancelFailed, error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ms-auto flex shrink-0 items-center gap-3">
      {failed === undefined ? null : (
        <p role="alert" className="text-danger">
          {failed}
        </p>
      )}
      <Button variant="ghost" size="sm" busy={busy} onClick={cancel}>
        {barWords.cancel}
      </Button>
    </div>
  );
}

/** The first run's state, read again at every change. */
export function useFirstRunState(firstRun: FirstRun) {
  return useSyncExternalStore(
    (listener) => firstRun.subscribe(listener),
    () => firstRun.state,
  );
}

/** Whether **Cancel run** ended the last run, read again at every change, a new run's too. */
function useLastCancelled(firstRun: FirstRun, start: FirstRunStart) {
  return useSyncExternalStore(
    (listener) => {
      const stopRun = firstRun.subscribe(listener);
      const stopStart = start.subscribe(listener);
      return () => {
        stopRun();
        stopStart();
      };
    },
    () => start.lastCancelled,
  );
}

/**
 * Skip goes with the bar, so the focus it had would fall to the body: it goes on at the shown
 * page's `h1`, or at the page itself while it has none (C556-1c).
 */
function focusPageStart() {
  const start = pageHeading() ?? document.querySelector<HTMLElement>("main");
  if (start === null) return;
  if (!start.hasAttribute("tabindex")) {
    start.tabIndex = -1;
  }
  start.focus({ preventScroll: true });
}

const barClasses =
  "flex min-h-10 shrink-0 flex-wrap items-center gap-3 border-b border-border bg-surface-subtle px-4 py-1.5 text-small";

/** A step; `railAfter` is the mark of the step before it, when a rail joins the two. */
function StepItem({
  step,
  railAfter,
}: {
  readonly step: BarStep;
  readonly railAfter?: BarMark | undefined;
}) {
  const name = barWords.steps[step.step];
  return (
    <li
      className="flex items-center"
      aria-current={step.mark === "current" || step.mark === "failed" ? "step" : undefined}
    >
      {railAfter === undefined ? null : <Rail after={railAfter} />}
      <span className="flex items-center gap-1.5">
        <StepMark mark={step.mark} />
        <span className={`font-medium ${step.mark === "todo" ? "text-fg-muted" : "text-fg"}`}>
          {step.number} {name}
        </span>
        {spokenMark(step.mark)}
      </span>
    </li>
  );
}

/** The 16px line between two steps, green after a done one; it keeps a colour in high contrast. */
function Rail({ after }: { readonly after: BarMark }) {
  const colour = after === "done" ? "bg-success" : "bg-border-strong";
  return (
    <span
      aria-hidden="true"
      data-rail=""
      className={`mx-2 h-px w-4 shrink-0 ${colour} forced-color-adjust-none forced-colors:bg-[CanvasText]`}
    />
  );
}

/** What a screen reader hears after a done or failed step's name; the mark itself is hidden. */
function spokenMark(mark: BarMark) {
  if (mark === "done") return <span className="sr-only">, {barWords.done}</span>;
  if (mark === "failed") return <span className="sr-only">, {barWords.failed}</span>;
  return null;
}

const markClasses = "grid size-4 shrink-0 place-items-center rounded-full *:size-3";

// High contrast drops the fill, so a border keeps the tick's and the cross's disc round.
const discInHighContrast = "forced-colors:border forced-colors:border-[CanvasText]";

/** The 16px mark before a step: a tick, the ring-and-dot, a red cross, or an empty ring. */
function StepMark({ mark }: { readonly mark: BarMark }) {
  switch (mark) {
    case "done":
      return (
        <span
          aria-hidden="true"
          className={`${markClasses} bg-success text-on-success ${discInHighContrast}`}
        >
          <TickIcon />
        </span>
      );
    case "failed":
      return (
        <span
          aria-hidden="true"
          className={`${markClasses} bg-danger text-on-danger ${discInHighContrast}`}
        >
          <CloseIcon />
        </span>
      );
    case "current":
      return (
        <span aria-hidden="true" className={`${markClasses} border-2 border-accent`}>
          <span className="size-1.5! rounded-full bg-accent forced-color-adjust-none forced-colors:bg-[CanvasText]" />
        </span>
      );
    case "todo":
      return <span aria-hidden="true" className={`${markClasses} border border-border-strong`} />;
  }
}
