import {
  Button,
  ChevronDownIcon,
  Menu,
  MoreIcon,
  Select,
  type SelectOption,
} from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import type { WorkflowArrow, WorkflowArrowChange, WorkflowArrowFieldChange } from "../api.ts";
import { problemGlyph } from "../configuration/problem-lines.ts";
import { arrowAddedLine, withNeverTaken } from "./arrow-announcements.ts";
import { ArrowFields } from "./arrow-fields.tsx";
import { conditionWords } from "./condition-words.ts";
import { neverTaken } from "./never-taken.ts";
import { pageWords } from "./page-words.ts";
import { type NamedStep, nameOf, stepNames } from "./step-names.ts";
import { TrashIcon } from "./trash-icon.tsx";

const words = pageWords.arrows;

/**
 * A row lines up on its first line when its words wrap (C547 A5): the row aligns to the top and
 * the number sits centred in a box as high as a one-line `sm` button (`lg` on a phone or touch
 * screen, as the button grows there), so it stays beside the first line and one-line rows look
 * as before.
 */
const arrowNumber = [
  "flex h-control-sm w-4 shrink-0 items-center text-fg-muted tabular-nums",
  "phone:h-control-lg touch:h-control-lg",
].join(" ");

/**
 * A row's button holds one child, so the kit button's flex row doesn't split it into centred
 * columns when the words wrap (C564 A): the chevron and the words, side by side. The chevron's
 * cell is one 20px line high, so on a wrapped row it stays beside the first line, like the number
 * (HAL-15199); the words wrap under each other, from the left. A one-line row is one line high,
 * as before.
 */
const arrowLabel = "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-1.5";
const arrowChevron = "flex h-5 items-center";
const arrowChevronIcon = "inline-grid size-icon-sm place-items-center *:size-full";

/** A row's words wrap like a sentence, from the left, instead of centred like a button label. */
const arrowWords = "min-w-0 text-start";

/** Props for {@link StepArrows}. */
export interface StepArrowsProps {
  readonly stepId: string;
  /** The step's arrows, in the order its file lists them. */
  readonly arrows: readonly WorkflowArrow[];
  /** Every step of the workflow, which **Go to…** (all but this one) and an arrow's **To** offer. */
  readonly steps: readonly NamedStep[];
  /** The step is a wait, so its arrows can fire after a time. */
  readonly isWait: boolean;
  /** Makes one change of the step's arrows; resolves to whether it was written. */
  readonly change: (change: WorkflowArrowChange) => Promise<boolean>;
  /** Removes the arrow at `index`, which is `arrow`; resolves to whether it went. Absent: no trash buttons. */
  readonly remove?: ((index: number, arrow: WorkflowArrow) => Promise<boolean>) | undefined;
  readonly announce?: ((line: string) => void) | undefined;
  /** Hears how many fields of the expanded arrow aren't saved. */
  readonly reportNotSaved?: ((count: number) => void) | undefined;
}

/** What an arrow's row says after its target: "on done if category = refund", "after 2d". */
function whenItFires(arrow: WorkflowArrow): string {
  const fires =
    arrow.after === undefined ? words.on(arrow.event ?? "done") : words.after(arrow.after);
  return arrow.condition === undefined
    ? fires
    : `${fires} ${words.when(conditionWords(arrow.condition))}`;
}

/** `arrows` with the one at `index` moved one place up (`-1`) or down (`1`), as a move writes it. */
function swapped(arrows: readonly WorkflowArrow[], index: number, by: -1 | 1): WorkflowArrow[] {
  const next = [...arrows];
  const [arrow] = next.splice(index, 1);
  if (arrow !== undefined) next.splice(index + by, 0, arrow);
  return next;
}

/**
 * Under a row's words, for an arrow an earlier one always beats: "△ Never taken: arrow 1 always
 * matches first". It is a check's warning, so it takes the attention tone the canvas gives the same
 * check (C592 1); the row's button is described by it, so it is read with the row (C592 2).
 */
function NeverTakenLine({
  id,
  beatenBy,
}: {
  readonly id: string;
  readonly beatenBy: number | undefined;
}) {
  if (beatenBy === undefined) return null;
  return (
    <span id={id} className="block px-2 text-caption text-attention">
      <span aria-hidden="true">{problemGlyph.warning} </span>
      {words.neverTakenRow(beatenBy)}
    </span>
  );
}

/**
 * The step card's "Arrows (first match wins)" (`workflows.page.step-arrows`, flow-workflows 5.3):
 * the step's arrows numbered in file order, as "1 → draft on done", each with ⋮ › **Move up** and
 * **Move down**, then **Go to…** and **Add**, which adds an arrow on done to the step picked there.
 * A moved arrow keeps focus on its row's ⋮, now in its new place. Pressing a row expands it to
 * the arrow's fields (see {@link ArrowFields}); one row is expanded at a time.
 *
 * Steps are named as their cards on the canvas name them (C548 4). An arrow that an earlier one
 * always beats says so on its row, and a move or an add that makes one says so as it is announced
 * (C548 1): the canvas draws such an arrow like any other.
 *
 * A row's trash button removes its arrow at once; focus goes to the next row, else to **Add**
 * (flow-workflows 4.6).
 */
export function StepArrows({
  stepId,
  arrows,
  steps,
  isWait,
  change,
  remove,
  announce,
  reportNotSaved,
}: StepArrowsProps) {
  const headingId = useId();
  const fieldsId = useId();
  // Each row's never-taken line is `${neverTakenId}-<place>`, which its button is described by.
  const neverTakenId = useId();
  const list = useRef<HTMLOListElement>(null);
  const goToPicker = useRef<HTMLElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const [target, setTarget] = useState("");
  // The row whose ⋮ takes focus once the moved arrow is drawn in its new place.
  const [focusRow, setFocusRow] = useState<number | undefined>();
  // Set while a move is written: the rows still show the old order, so a second move would pick
  // the arrow by its old place.
  const moving = useRef(false);
  // The expanded row, by its place in the list.
  const [expanded, setExpanded] = useState<number | undefined>();
  const names = stepNames(steps);
  const beatenBy = neverTaken(arrows);

  useEffect(() => {
    if (focusRow === undefined) return;
    const row = list.current?.querySelectorAll("li")[focusRow];
    row?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')?.focus();
    setFocusRow(undefined);
  }, [focusRow, arrows]);

  const move = async (index: number, by: -1 | 1) => {
    const arrow = arrows[index];
    if (moving.current || arrow === undefined) return;
    moving.current = true;
    try {
      if (!(await change({ kind: "move", index, by, to: arrow.to }))) return;
    } finally {
      moving.current = false;
    }
    setFocusRow(index + by);
    // An expanded row stays expanded on the arrow it shows, which changed places.
    if (expanded === index) setExpanded(index + by);
    else if (expanded === index + by) setExpanded(index);
    const line = words.moved(index + 1, index + by + 1);
    announce?.(withNeverTaken(line, swapped(arrows, index, by), [index, index + by]));
  };
  const removeAt = async (index: number, arrow: WorkflowArrow) => {
    if (remove === undefined || !(await remove(index, arrow))) return;
    // The next arrow moves up into this row, which keeps its place in the list; the last has none.
    const next = index < arrows.length - 1;
    const row = list.current?.querySelectorAll("li")[index];
    if (next) row?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus();
    else addButton.current?.focus();
    if (expanded === index) setExpanded(undefined);
    else if (expanded !== undefined && expanded > index) setExpanded(expanded - 1);
  };
  const add = async () => {
    // Add with no step picked goes to the picker, which says what it needs.
    if (target === "") {
      goToPicker.current?.focus();
      return;
    }
    if (!(await change({ kind: "add", to: target }))) return;
    setTarget("");
    // The new arrow is on done without a condition. When an earlier arrow always beats it, its
    // fields open, so its condition is one step away.
    const added = [...arrows, { from: stepId, to: target }];
    if (neverTaken(added)[arrows.length] !== undefined) setExpanded(arrows.length);
    announce?.(arrowAddedLine(steps, arrows, stepId, target));
  };
  // An arrow back to the step itself, on done, would run it again for ever, so Go to… leaves the
  // step out; an arrow's own To still offers it, for a wait or a retry that needs one.
  const options: readonly SelectOption[] = steps
    .filter((step) => step.id !== stepId)
    .map((step) => ({ value: step.id, label: nameOf(names, step.id) }));

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-body-strong text-fg">
        {words.heading}
      </h3>
      {arrows.length > 0 && (
        <ol ref={list} className="flex flex-col gap-1">
          {arrows.map((arrow, index) => (
            // An arrow has no name of its own: its place in the list is what the file knows it by.
            <li key={index} className="flex flex-col gap-2">
              <div className="flex items-start gap-2 text-body">
                <span className={arrowNumber}>{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={expanded === index}
                    {...(expanded === index ? { "aria-controls": fieldsId } : {})}
                    {...(beatenBy[index] === undefined
                      ? {}
                      : { "aria-describedby": `${neverTakenId}-${index}` })}
                    onClick={() => setExpanded(expanded === index ? undefined : index)}
                  >
                    <span className={arrowLabel}>
                      <span className={arrowChevron} aria-hidden="true">
                        <span className={arrowChevronIcon}>
                          <ChevronDownIcon />
                        </span>
                      </span>
                      <span className={arrowWords}>
                        <span className="font-medium">{words.to(nameOf(names, arrow.to))}</span>{" "}
                        <span className="text-fg-muted">{whenItFires(arrow)}</span>
                      </span>
                    </span>
                  </Button>
                  <NeverTakenLine id={`${neverTakenId}-${index}`} beatenBy={beatenBy[index]} />
                </span>
                <Menu
                  align="end"
                  trigger={(props) => (
                    <Button
                      {...props}
                      variant="ghost"
                      size="sm"
                      icon={<MoreIcon />}
                      label={words.more(index + 1)}
                    />
                  )}
                  entries={[
                    {
                      id: "up",
                      label: words.moveUp,
                      disabled: index === 0,
                      onSelect: () => void move(index, -1),
                    },
                    {
                      id: "down",
                      label: words.moveDown,
                      disabled: index === arrows.length - 1,
                      onSelect: () => void move(index, 1),
                    },
                  ]}
                />
                {remove !== undefined && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<TrashIcon />}
                    label={words.remove(index + 1)}
                    onClick={() => void removeAt(index, arrow)}
                  />
                )}
              </div>
              {expanded === index && (
                <ArrowFields
                  arrow={arrow}
                  id={fieldsId}
                  steps={steps}
                  fromWait={isWait}
                  set={(field: WorkflowArrowFieldChange) =>
                    change({ kind: "set", index, to: arrow.to, ...field })
                  }
                  reportNotSaved={reportNotSaved}
                />
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Select
            ref={goToPicker}
            aria-label={words.goTo}
            placeholder={words.goTo}
            options={options}
            value={target}
            onChange={setTarget}
            size="sm"
          />
        </div>
        <Button ref={addButton} variant="secondary" size="sm" onClick={() => void add()}>
          {words.add}
        </Button>
      </div>
    </section>
  );
}

/** Props for {@link ArrowsIn}. */
export interface ArrowsInProps {
  /** The steps with an arrow to this one, each once, in the file's order. */
  readonly from: readonly string[];
  /** Every step of the workflow, to name those in `from` as the canvas does. */
  readonly steps: readonly NamedStep[];
  /** Opens a step's card, so the flow can be walked backwards. */
  readonly onOpen: (stepId: string) => void;
}

/** The step card's "Arrows in" (UX checklist 10.8, a11y 7.2): "From triage", each opening its step. */
export function ArrowsIn({ from, steps, onOpen }: ArrowsInProps) {
  const headingId = useId();
  const names = stepNames(steps);
  if (from.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <h3 id={headingId} className="text-body-strong text-fg">
        {words.arrowsIn}
      </h3>
      <ul className="flex flex-col items-start gap-1">
        {from.map((stepId) => (
          <li key={stepId}>
            <Button variant="ghost" size="sm" onClick={() => onOpen(stepId)}>
              {words.from(nameOf(names, stepId))}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
