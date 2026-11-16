import { Button, List, type ListRow, TickIcon } from "@halonicjs/studio-kit";
import { type HomeCardProps, HomeSectionEmpty } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { FirstRunService, type SampleStepId, sampleSteps } from "../api.ts";
import type { SampleProgress } from "../sample-progress.ts";
import { sampleCardWords, sampleStepWords } from "../sample-text.ts";
import { type StepOpeners, stepOpeners } from "./step-openers.ts";

/** Home's Get set up slot in the Acme sample: the Try the sample card, or nothing elsewhere. */
export function SampleCard({ context }: HomeCardProps) {
  const progress = context.services.get(FirstRunService).progress();
  if (progress === undefined || progress.hidden) return <HomeSectionEmpty />;
  return <SampleSteps progress={progress} openers={stepOpeners(context, progress)} />;
}

/** Props for {@link SampleSteps}. */
export interface SampleStepsProps {
  readonly progress: SampleProgress;
  /** What each step opens; a step without one can't be opened. */
  readonly openers: StepOpeners;
}

/**
 * The three steps of the sample with "N of 3 done" above them, as Get set up draws its own. Once
 * all three are done it says "You've seen it work." with **Start your own workspace** instead,
 * and the card is gone from the next visit on. Steps can be done in any order and by
 * any route: the card only shows what happened.
 */
export function SampleSteps({ progress, openers }: SampleStepsProps) {
  const subscribe = useCallback((listener: () => void) => progress.subscribe(listener), [progress]);
  const { done } = useSyncExternalStore(subscribe, () => progress.state);
  const finished = done.size === sampleSteps.length;
  useEffect(() => {
    if (finished) progress.recordFinishedShown();
  }, [finished, progress]);
  if (finished) {
    const startOwnWorkspace = progress.startOwnWorkspace;
    return (
      <>
        <p>
          <TickIcon /> {sampleCardWords.finished}
        </p>
        <p>{sampleCardWords.caption(done.size)}</p>
        {startOwnWorkspace === undefined ? null : (
          <Button variant="secondary" size="sm" onClick={startOwnWorkspace}>
            {sampleCardWords.startOwnWorkspace}
          </Button>
        )}
      </>
    );
  }
  const rows: ListRow<SampleStepId>[] = sampleSteps.map((step, index) => ({
    id: step,
    title: sampleStepWords[step].title,
    meta: sampleStepWords[step].hint,
    icon: done.has(step) ? <TickIcon /> : <span aria-hidden="true">{index + 1}</span>,
    ...(done.has(step)
      ? { trailing: <span className="sr-only">{sampleCardWords.doneNote}</span> }
      : {}),
  }));
  return (
    <>
      <p>{sampleCardWords.caption(done.size)}</p>
      <List label={sampleCardWords.heading} rows={rows} onOpen={(step) => openers[step]()} />
    </>
  );
}
