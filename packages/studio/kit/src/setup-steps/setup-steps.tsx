import { ChevronRightIcon } from "../icons/chevron-right-icon.tsx";
import { TickIcon } from "../icons/tick-icon.tsx";
import { List } from "../list/list.tsx";
import type { ListRow } from "../list/list-props.ts";

/** One step of a setup card: "Connect a model", "Start a support request". */
export interface SetupStep<Id extends string = string> {
  /** Stable, never the index: focus follows it. */
  readonly id: Id;
  readonly title: string;
  /** The line under the title: "An invented customer asks for a refund." */
  readonly hint: string;
  readonly done: boolean;
  /**
   * The sentence a screen reader hears for the row, with the step's place and whether it's done:
   * "Step 2 of 3: Approve or reject the reply, not done". The circle and the tick are hidden.
   */
  readonly label: string;
}

/** Props for {@link SetupSteps}. */
export interface SetupStepsProps<Id extends string = string> {
  /** The list's name: "Try the sample". The card's own heading shows it. */
  readonly label: string;
  /** In order: each step's number is its place. */
  readonly steps: readonly SetupStep<Id>[];
  /** Enter or a click on the row of a step still to do. A done step's row does nothing. */
  readonly onOpen: (id: Id) => void;
}

const circleClasses = "grid size-6 place-items-center rounded-full border text-small";

/**
 * The 24px circle before a step: its number outlined while to do, a tick on a filled `success`
 * circle once done. The 2px margin centres it in the row's 28px avatar slot.
 */
function StepCircle({ number, done }: { readonly number: number; readonly done: boolean }) {
  if (done) {
    return (
      <span
        className={`${circleClasses} m-0.5 border-success bg-success text-on-success *:size-icon-sm`}
      >
        <TickIcon />
      </span>
    );
  }
  return (
    <span className={`${circleClasses} m-0.5 border-border-strong text-fg-muted`}>{number}</span>
  );
}

/** The chevron of a step still to do, at the row's right edge so the chevrons line up. */
function StepChevron() {
  return (
    <span className="inline-grid size-icon-md text-fg-subtle *:size-full" aria-hidden="true">
      <ChevronRightIcon />
    </span>
  );
}

/**
 * The steps of a setup card, as Get set up's and the sample's Try the sample (HAL-477 2.2, first
 * run 3.3): a 56px row each with a 24px number circle, the title and its hint, and a chevron while
 * it isn't done. A done step has a `success` circle with a tick and its title in `fg-muted`, not
 * struck through, and no chevron, and its row does nothing: there's nothing left to do there. It
 * doesn't look pressable either, and Tab enters at the first step still to do.
 */
export function SetupSteps<Id extends string>({ label, steps, onOpen }: SetupStepsProps<Id>) {
  const rows: ListRow<Id>[] = steps.map((step, index) => ({
    id: step.id,
    title: step.title,
    meta: step.hint,
    label: step.label,
    avatar: <StepCircle number={index + 1} done={step.done} />,
    muted: step.done,
    inert: step.done,
    trailing: step.done ? undefined : <StepChevron />,
  }));
  return <List label={label} rows={rows} onOpen={onOpen} />;
}
