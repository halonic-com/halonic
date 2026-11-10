import {
  type ChangeEvent,
  type FocusEvent,
  type ReactNode,
  type Ref,
  useLayoutEffect,
  useRef,
} from "react";
import { assignRef, describedBy } from "../field/control.ts";
import { useFieldControl } from "../field/field.tsx";

/** Why a checkbox can't be used right now, written as visible text near it. */
export interface CheckboxUnavailable {
  /** The `id` of the visible text that says why: "Still downloading". */
  readonly reason: string;
}

interface CheckboxBase {
  readonly checked: boolean;
  /** Called with the new value. Not called while `unavailable`. */
  readonly onChange: (checked: boolean) => void;
  /** Some of what it stands for, not all: a dash in place of the check, read as "mixed". */
  readonly indeterminate?: boolean;
  /**
   * It can't be used now. It stays focusable and keeps its value, ignores clicks and Space, and
   * points screen readers at the reason. There's no `disabled` prop on purpose (component specs
   * 23, A1).
   */
  readonly unavailable?: CheckboxUnavailable | undefined;
  /** `-1` only inside a grid, which moves focus with the arrow keys (a List row's checkbox). */
  readonly tabIndex?: 0 | -1;
  readonly onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  readonly ref?: Ref<HTMLInputElement>;
}

/** A checkbox with its words next to it: "Run on a schedule". The words are the target too. */
interface CheckboxWithText extends CheckboxBase {
  readonly children: ReactNode;
  readonly label?: never;
}

/** A checkbox without words of its own, as in a List row: its name says what and which. */
interface CheckboxWithLabel extends CheckboxBase {
  /** "Select Sorter", "Stage classifier.ts". */
  readonly label: string;
  readonly children?: never;
}

export type CheckboxProps = CheckboxWithText | CheckboxWithLabel;

/**
 * The 16px box. A native checkbox without its own look, so the browser keeps its keyboard and
 * screen reader behaviour. An empty box's edge turns `fg-muted` while the pointer is over it or
 * over a `group/checkbox` round it (its label, a List row's cell), so a click there reads as "this
 * selects". Checked and mixed fill `primary`.
 * In high contrast `checkbox-forced` fills a checked box `Highlight`.
 */
const boxShared = [
  "peer m-0 size-4 shrink-0 cursor-pointer appearance-none rounded-xs border bg-surface",
  "transition-colors focus-ring checkbox-forced",
  "checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary",
].join(" ");

const boxStateClasses = {
  default: "border-border-control",
  // Only on an empty box: a checked one keeps its primary edge.
  hoverable: "border-border-control hover:border-fg-muted group-hover/checkbox:border-fg-muted",
  invalid: "border-danger",
  // 45%, and GrayText at full strength in high contrast, as an unavailable Button.
  unavailable:
    "cursor-not-allowed border-fg-disabled opacity-45 contrast-more:opacity-60 forced-colors:opacity-100",
} as const;

/** The check or the dash, on top of the box. It shows only while the box is checked or mixed. */
const markClasses = [
  "pointer-events-none absolute inset-0 hidden place-items-center text-on-primary *:size-3",
  "peer-checked:grid peer-indeterminate:grid",
].join(" ");

function boxState(
  unavailable: boolean,
  invalid: boolean,
  marked: boolean,
): keyof typeof boxStateClasses {
  if (unavailable) {
    return "unavailable";
  }
  if (invalid) {
    return "invalid";
  }
  return marked ? "default" : "hoverable";
}

/**
 * A choice that is on or off: "Run on a schedule", or a List row's "Select Sorter". In a Field
 * it takes the Field's error: a `danger` edge, with the error line under it.
 *
 * @example
 * <Checkbox checked={scheduled} onChange={setScheduled}>Run on a schedule</Checkbox>
 * <Checkbox label="Select Sorter" checked={selected.has("sorter")} onChange={() => toggle("sorter")} />
 */
export function Checkbox(props: CheckboxProps) {
  const { checked, onChange, indeterminate = false, unavailable, tabIndex, onFocus, ref } = props;
  const field = useFieldControl();
  const input = useRef<HTMLInputElement | null>(null);
  const isUnavailable = unavailable !== undefined;

  // `indeterminate` is a property only: there's no attribute for it. A click or Space clears it,
  // and React only puts `checked` back, so it's set again on every render, not only on a change.
  useLayoutEffect(() => {
    if (input.current !== null) {
      input.current.indeterminate = indeterminate;
    }
  });

  const inside = (
    <>
      <input
        type="checkbox"
        ref={(element) => {
          input.current = element;
          assignRef(ref, element);
        }}
        // With words of its own the box is named by them, not by the Field's label as well.
        id={props.children === undefined ? field?.id : undefined}
        checked={checked}
        aria-label={props.label}
        aria-disabled={isUnavailable ? true : undefined}
        aria-invalid={field?.invalid === true ? true : undefined}
        aria-describedby={describedBy(unavailable?.reason, field?.describedBy)}
        tabIndex={tabIndex}
        className={`${boxShared} ${boxStateClasses[boxState(isUnavailable, field?.invalid === true, checked || indeterminate)]}`}
        // Space and a click on the box or its words both arrive here, and the browser has already
        // flipped the box and cleared its dash. React puts `checked` back from the prop; the dash is
        // put back here, because the screen may keep the box mixed without rendering again. An
        // unavailable box reports nothing. (Cancelling the click instead fights React's own restore
        // and leaves the box flipped.)
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          event.target.indeterminate = indeterminate;
          if (!isUnavailable) {
            onChange(event.target.checked);
          }
        }}
        onFocus={onFocus}
      />
      <span aria-hidden="true" className={markClasses}>
        {indeterminate ? <DashMark /> : <CheckMark />}
      </span>
    </>
  );
  const cursor = isUnavailable ? "cursor-not-allowed" : "cursor-pointer";

  if (props.children === undefined) {
    // Without words the box is still a 48px target on a phone or a touch screen. The target is
    // the label's ::after, and a label passes its clicks on to the box.
    return (
      // biome-ignore lint/a11y/noLabelWithoutControl: the input is inside `inside`, which Biome can't see; aria-label names it
      <label
        className={`relative inline-grid size-4 shrink-0 phone:hit-touch touch:hit-touch ${cursor}`}
      >
        {inside}
      </label>
    );
  }
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the input is inside `inside`, which Biome can't see
    <label
      className={`group/checkbox inline-flex items-center gap-2 text-body phone:min-h-touch touch:min-h-touch ${cursor} ${isUnavailable ? "text-fg-disabled text-forced-disabled" : "text-fg"}`}
    >
      <span className="relative inline-grid size-4 shrink-0">{inside}</span>
      {props.children}
    </label>
  );
}

function CheckMark() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M2.5 6.25 5 8.75l4.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DashMark() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 6h6" strokeLinecap="round" />
    </svg>
  );
}
