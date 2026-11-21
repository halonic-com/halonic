import type { ReactNode } from "react";
import { ChevronRightIcon } from "../icons/chevron-right-icon.tsx";
import { TickIcon } from "../icons/tick-icon.tsx";
import { List } from "../list/list.tsx";
import type { ListRow, ListRowAction } from "../list/list-props.ts";
import { useWaitedMs, WaitingLine } from "../waiting-line/waiting-line.tsx";

/**
 * Where a step that checks something stands, as Connect a model checks Ollama (first-run-progress
 * 3.1). The screen runs the check and gives up at its limit, 5 seconds; the row only draws it.
 */
export type SetupStepCheck =
  | {
      readonly state: "checking";
      /**
       * What the check waits for, named, as a WaitingLine's: `<>Checking Ollama at
       * <code>localhost:11434</code>…</>`.
       */
      readonly what: ReactNode;
      /** When the check started: the line counts from it, and shows from 2 seconds. */
      readonly since: Date;
    }
  | {
      /**
       * The check found something to fix. Amber, not red: the user hasn't run anything yet, and
       * red stays for a run that failed.
       */
      readonly state: "problem";
      /**
       * The cause, in the hint's place: "Ollama isn't answering at localhost:11434. Start
       * Ollama, or add an API key for a cloud model."
       */
      readonly cause: ReactNode;
      /** The ways out, in order: Check again, Open Models, Something wrong?. */
      readonly actions: readonly ListRowAction[];
    };

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
   * "Step 2 of 3: Approve or reject the reply, not done". The circle and the tick are hidden, so
   * a problem is in it too: "Step 1 of 3: Connect a model, problem".
   */
  readonly label: string;
  /** The step's check, while it runs or once it found a problem. A done step draws none. */
  readonly check?: SetupStepCheck;
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

const circleClasses = "m-0.5 grid size-6 place-items-center rounded-full border text-small";

/** The outline and the number's colour of a step still to do, by its check. */
const toDoCircleClasses = {
  none: "border-border-strong text-fg-muted",
  checking: "border-running text-running",
  problem: "border-attention font-medium text-attention",
} as const;

/**
 * The 24px circle before a step: its number outlined while to do, in `running` while its check
 * runs, an amber "!" in place of the number when the check found a problem, and a tick on a filled
 * `success` circle once done. The 2px margin centres it in the row's 28px avatar slot.
 */
function StepCircle({ number, step }: { readonly number: number; readonly step: SetupStep }) {
  if (step.done) {
    return (
      <span className={`${circleClasses} border-success bg-success text-on-success *:size-icon-sm`}>
        <TickIcon />
      </span>
    );
  }
  const check = step.check?.state ?? "none";
  return (
    <span className={`${circleClasses} ${toDoCircleClasses[check]}`}>
      {check === "problem" ? "!" : number}
    </span>
  );
}

/**
 * The step's WaitingLine while its check runs. Its own component, so only the line redraws each
 * second, not the steps.
 */
function StepWaitingLine({ what, since }: { readonly what: ReactNode; readonly since: Date }) {
  const waitedMs = useWaitedMs(since);
  return <WaitingLine placement="row" what={what} waitedMs={waitedMs} />;
}

/** What the step's check adds to its row: the waiting line, or the cause and the ways out. */
function checkParts(step: SetupStep): Pick<ListRow, "meta" | "under" | "actions"> {
  const check = step.done ? undefined : step.check;
  if (check?.state === "checking") {
    return { meta: step.hint, under: <StepWaitingLine what={check.what} since={check.since} /> };
  }
  if (check?.state === "problem") {
    return { meta: check.cause, actions: check.actions };
  }
  return { meta: step.hint };
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
 * run 3.3): a row of at least 56px each with a 24px number circle, the title and its hint, and a
 * chevron while it isn't done. The title and the hint wrap rather than being cut, so a phone
 * shows them whole, and the hint is the row's description for screen readers (HAL-13121). A done step has a `success` circle with a tick and its title in `fg-muted`, not
 * struck through, and no chevron, and its row does nothing: there's nothing left to do there. It
 * doesn't look pressable either, and Tab enters at the first step still to do.
 *
 * A step that checks something (first-run-progress 3.1) shows its WaitingLine under the hint while
 * the check runs, with its circle in `running`. When the check finds a problem, the circle turns
 * amber with a "!", the cause takes the hint's place, and the ways out sit under it as text
 * buttons that → reaches. The row still opens, and the other steps stay as they are: a problem in
 * one step never locks another.
 */
export function SetupSteps<Id extends string>({ label, steps, onOpen }: SetupStepsProps<Id>) {
  const rows: ListRow<Id>[] = steps.map((step, index) => ({
    id: step.id,
    title: step.title,
    ...checkParts(step),
    label: step.label,
    avatar: <StepCircle number={index + 1} step={step} />,
    muted: step.done,
    inert: step.done,
    wrap: true,
    metaDescribes: true,
    trailing: step.done ? undefined : <StepChevron />,
  }));
  return <List label={label} rows={rows} onOpen={onOpen} />;
}
