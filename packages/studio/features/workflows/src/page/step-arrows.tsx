import { Button, Menu, MoreIcon, Select, type SelectOption } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import type { WorkflowArrow, WorkflowArrowChange } from "../api.ts";
import { conditionWords } from "./condition-words.ts";
import { pageWords } from "./page-words.ts";

const words = pageWords.arrows;

/** Props for {@link StepArrows}. */
export interface StepArrowsProps {
  readonly stepId: string;
  /** The step's arrows, in the order its file lists them. */
  readonly arrows: readonly WorkflowArrow[];
  /** Every step of the workflow, which **Go to…** offers. */
  readonly stepIds: readonly string[];
  /** Makes one change of the step's arrows; resolves to whether it was written. */
  readonly change: (change: WorkflowArrowChange) => Promise<boolean>;
  readonly announce?: ((line: string) => void) | undefined;
}

/** What an arrow's row says after its target: "on done if category = refund", "after 2d". */
function whenItFires(arrow: WorkflowArrow): string {
  const fires =
    arrow.after === undefined ? words.on(arrow.event ?? "done") : words.after(arrow.after);
  return arrow.condition === undefined
    ? fires
    : `${fires} ${words.when(conditionWords(arrow.condition))}`;
}

/**
 * The step card's "Arrows (first match wins)" (`workflows.page.step-arrows`, flow-workflows 5.3):
 * the step's arrows numbered in file order, as "1 → draft on done", each with ⋮ › **Move up** and
 * **Move down**, then **Go to…** and **Add**, which adds an arrow on done to the step picked there.
 * A moved arrow keeps focus on its row's ⋮, now in its new place.
 */
export function StepArrows({ stepId, arrows, stepIds, change, announce }: StepArrowsProps) {
  const headingId = useId();
  const list = useRef<HTMLOListElement>(null);
  const goToPicker = useRef<HTMLElement>(null);
  const [target, setTarget] = useState("");
  // The row whose ⋮ takes focus once the moved arrow is drawn in its new place.
  const [focusRow, setFocusRow] = useState<number | undefined>();

  useEffect(() => {
    if (focusRow === undefined) return;
    const row = list.current?.querySelectorAll("li")[focusRow];
    row?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')?.focus();
    setFocusRow(undefined);
  }, [focusRow, arrows]);

  const move = async (index: number, by: -1 | 1) => {
    if (!(await change({ kind: "move", index, by }))) return;
    setFocusRow(index + by);
    announce?.(words.moved(index + 1, index + by + 1));
  };
  const add = async () => {
    // Add with no step picked goes to the picker, which says what it needs.
    if (target === "") {
      goToPicker.current?.focus();
      return;
    }
    if (!(await change({ kind: "add", to: target }))) return;
    setTarget("");
    announce?.(words.added(stepId, target));
  };
  const options: readonly SelectOption[] = stepIds.map((id) => ({ value: id, label: id }));

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-body-strong text-fg">
        {words.heading}
      </h3>
      {arrows.length > 0 && (
        <ol ref={list} className="flex flex-col gap-1">
          {arrows.map((arrow, index) => (
            // An arrow has no name of its own: its place in the list is what the file knows it by.
            <li key={index} className="flex items-center gap-2 text-body">
              <span className="w-4 shrink-0 text-fg-muted tabular-nums">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{words.to(arrow.to)}</span>{" "}
                <span className="text-fg-muted">{whenItFires(arrow)}</span>
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
        <Button variant="secondary" size="sm" onClick={() => void add()}>
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
  /** Opens a step's card, so the flow can be walked backwards. */
  readonly onOpen: (stepId: string) => void;
}

/** The step card's "Arrows in" (UX checklist 10.8, a11y 7.2): "From triage", each opening its step. */
export function ArrowsIn({ from, onOpen }: ArrowsInProps) {
  const headingId = useId();
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
              {words.from(stepId)}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
