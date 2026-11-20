import {
  Button,
  ChevronRightIcon,
  type SetupStep,
  SetupSteps,
  TickIcon,
  usePresentation,
} from "@halonicjs/studio-kit";
import { type HomeCardProps, HomeSectionEmpty } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { FirstRunService, type SampleStepId, sampleSteps } from "../api.ts";
import type { SampleProgress } from "../sample-progress.ts";
import { sampleCardWords, sampleStepWords } from "../sample-text.ts";
import { type StepOpeners, stepOpeners, testsOpener } from "./step-openers.ts";

/** Home's Get set up slot in the Acme sample: the Try the sample card, or nothing elsewhere. */
export function SampleCard({ context }: HomeCardProps) {
  const progress = context.services.get(FirstRunService).progress();
  if (progress === undefined || progress.hidden) return <HomeSectionEmpty />;
  return (
    <SampleSteps
      progress={progress}
      openers={stepOpeners(context, progress)}
      openTests={testsOpener(context)}
      announce={(line) => context.announcer.announce(line)}
    />
  );
}

/**
 * A phone's finished-card row: 48px, a chevron at the right, a `border` line under it. Its `px-4`
 * starts the label where the section heading starts, as Home's See all runs does.
 */
const linkRowClasses = [
  "flex w-full min-h-touch items-center gap-3 border-b border-border px-4 text-left text-body",
  "transition-colors focus-ring-inset hover:bg-surface-subtle active:bg-surface-subtle",
].join(" ");

/** One of the phone's finished-card link rows. */
function LinkRow({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  return (
    <button type="button" className={linkRowClasses} onClick={onPress}>
      <span className="min-w-0 flex-1">{label}</span>
      <span className="size-icon-md shrink-0 text-fg-subtle *:size-full" aria-hidden="true">
        <ChevronRightIcon />
      </span>
    </button>
  );
}

/** The section heading's inset (`ListHeading`'s `px-4`), so the card's lines start where "TRY THE SAMPLE" does. */
const inset = "px-4";

/** "N of 3 done": inset like the heading, in the section's small muted style. */
function Caption({ done }: { readonly done: number }) {
  return (
    <p className={`${inset} pb-2 text-small text-fg-muted`}>{sampleCardWords.caption(done)}</p>
  );
}

/** "✓ You've seen it work.": the tick sits in an icon-sized box, as the kit's other inline icons do. */
function FinishedLine() {
  return (
    <p className={inset}>
      <span
        aria-hidden="true"
        className="inline-grid size-icon-sm align-middle text-success *:size-full"
      >
        <TickIcon />
      </span>{" "}
      {sampleCardWords.finished}
    </p>
  );
}

/** Props for {@link SampleSteps}. */
export interface SampleStepsProps {
  readonly progress: SampleProgress;
  /** What each step opens; a step without one can't be opened. */
  readonly openers: StepOpeners;
  /** Opens the support workflow's Tests in a hub; without it, or before a run has finished, the finished card has no See its tests. */
  readonly openTests?: ((hub: string) => void) | undefined;
  /** Says a line through the shell's announcer; the card says "Try the sample: 2 of 3 done." when a step finishes. */
  readonly announce?: (line: string) => void;
}

/**
 * The three steps of the sample with "N of 3 done" above them, as Get set up draws its own. Once
 * all three are done it says "You've seen it work." with **Start your own workspace** instead,
 * and the card is gone from the next visit on. Steps can be done in any order and by
 * any route: the card only shows what happened.
 */
export function SampleSteps({ progress, openers, openTests, announce }: SampleStepsProps) {
  const subscribe = useCallback((listener: () => void) => progress.subscribe(listener), [progress]);
  const { done, finishedRun } = useSyncExternalStore(subscribe, () => progress.state);
  const finished = done.size === sampleSteps.length;
  // A step finished while the card is open is said once; the count it opened with is not news.
  const announcedCount = useRef(done.size);
  useEffect(() => {
    if (done.size > announcedCount.current) {
      announce?.(sampleCardWords.progressAnnouncement(done.size));
    }
    announcedCount.current = done.size;
  }, [done.size, announce]);
  const phone = usePresentation() === "phone";
  useEffect(() => {
    if (finished) progress.recordFinishedShown();
  }, [finished, progress]);
  if (finished && phone) {
    // Two 48px link rows. The second does what the desktop's button does: the app decides what it opens.
    const startOwnWorkspace = progress.startOwnWorkspace;
    return (
      <>
        <FinishedLine />
        <Caption done={done.size} />
        <div className="border-t border-border">
          {openTests === undefined || finishedRun === undefined ? null : (
            <LinkRow label={sampleCardWords.seeTests} onPress={() => openTests(finishedRun.hub)} />
          )}
          {startOwnWorkspace === undefined ? null : (
            <LinkRow label={sampleCardWords.startOwnWorkspace} onPress={startOwnWorkspace} />
          )}
        </div>
      </>
    );
  }
  if (finished) {
    const startOwnWorkspace = progress.startOwnWorkspace;
    return (
      <>
        <FinishedLine />
        <Caption done={done.size} />
        {/* A block around the inline buttons: their outer border starts where the heading does, and they stay side by side as before. */}
        <div className={inset}>
          {openTests === undefined || finishedRun === undefined ? null : (
            <Button variant="secondary" size="sm" onClick={() => openTests(finishedRun.hub)}>
              {sampleCardWords.seeTests}
            </Button>
          )}
          {startOwnWorkspace === undefined ? null : (
            <Button variant="secondary" size="sm" onClick={startOwnWorkspace}>
              {sampleCardWords.startOwnWorkspace}
            </Button>
          )}
        </div>
      </>
    );
  }
  // Get set up's rows (HAL-477 2.2): number circles, a `success` tick and the done title muted.
  const steps: SetupStep<SampleStepId>[] = sampleSteps.map((step, index) => ({
    id: step,
    title: sampleStepWords[step].title,
    hint: sampleStepWords[step].hint,
    done: done.has(step),
    label: sampleCardWords.stepLabel(index + 1, sampleStepWords[step].title, done.has(step)),
  }));
  return (
    <>
      <Caption done={done.size} />
      <SetupSteps
        label={sampleCardWords.heading}
        steps={steps}
        onOpen={(step) => openers[step]()}
      />
    </>
  );
}
