import { TickIcon } from "@halonicjs/studio-kit";

/** Where a step is: finished, the one in hand, or still to come. */
export type StepState = "done" | "now" | "todo";

/** The word a screen reader hears for each state. */
export const stepStateWords: Readonly<Record<StepState, string>> = {
  done: "done",
  now: "current",
  todo: "to do",
};

const circle = "inline-grid size-6 shrink-0 place-items-center rounded-full border text-small";

const looks: Record<StepState, string> = {
  todo: "border-border-strong text-fg-muted",
  now: "border-primary bg-primary text-on-primary",
  done: "border-border-strong text-fg",
};

/**
 * The mark before a step's title: its number outlined while to do, filled while current, a tick
 * once done. The word for a screen reader is in the title, so the mark itself is hidden from it.
 */
export function StepMark({
  number,
  state,
}: {
  readonly number: number;
  readonly state: StepState;
}) {
  return (
    <span aria-hidden="true" className={`${circle} ${looks[state]}`}>
      {state === "done" ? <TickIcon /> : number}
    </span>
  );
}
