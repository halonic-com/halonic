import { type MouseEvent, useId, useState } from "react";
import { ChevronDownIcon } from "../icons/chevron-down-icon.tsx";
import { TickIcon } from "../icons/tick-icon.tsx";
import { Menu, type MenuEntry, type MenuTriggerProps } from "../menu/menu.tsx";
import { PickerSheet } from "../picker-sheet/picker-sheet.tsx";
import { usePresentation } from "../presentation/presentation.tsx";

/** One chip of a one-of row: the hub filter's "All", "acme", "beta". */
export interface FilterOption<Value extends string = string> {
  readonly value: Value;
  readonly label: string;
}

/** An on/off chip in a row of filters: Runs' "Test runs". */
export interface FilterToggle {
  readonly label: string;
  readonly pressed: boolean;
  readonly onChange: (pressed: boolean) => void;
  /**
   * The chip can't be used now. It stays focusable and keeps its state, ignores presses and
   * points screen readers at the `id` of the visible hint that says why.
   */
  readonly unavailable?: { readonly reason: string };
}

/**
 * A picker chip in a row of filters: the hub filter on Runs, "Hub: All hubs ⌄". It shows the
 * picked value, or the "all" words with nothing picked, and opens a list of all of them.
 */
export interface FilterPicker {
  /** What it filters, and the picker's title: "Hub". */
  readonly label: string;
  /** The chip's words with nothing picked, and the list's first option: "All hubs". */
  readonly all: string;
  readonly options: readonly FilterOption[];
  /** The picked value, or `undefined` for all. */
  readonly value: string | undefined;
  /** Called with the value the user picks, or `undefined` when they pick all. */
  readonly onChange: (value: string | undefined) => void;
}

interface RowLabel {
  /** What the row filters, for screen readers: "Hub", "Filters". */
  readonly label: string;
}

/** One-of: a radio group, where exactly one chip is on and the arrow keys move it. */
export interface FilterChipsOneOf<Value extends string = string> extends RowLabel {
  readonly options: readonly FilterOption<Value>[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
  readonly toggles?: never;
}

/**
 * A row of filters that aren't one-of: picker chips first, then on/off chips, each a toggle
 * button with `aria-pressed`.
 */
export interface FilterChipsToggles extends RowLabel {
  readonly pickers?: readonly FilterPicker[];
  readonly toggles?: readonly FilterToggle[];
  readonly options?: never;
}

/** The props of `FilterChips`. */
export type FilterChipsProps<Value extends string = string> =
  | FilterChipsOneOf<Value>
  | FilterChipsToggles;

/**
 * 28px on desktop; 32px on a phone or a touch screen, with a 48px hit area. The row's 16px
 * between wrapped lines keeps two lines' hit areas apart.
 */
const chipSize =
  "relative inline-flex min-h-control-sm items-center gap-1 text-small phone:min-h-8 phone:hit-touch touch:min-h-8 touch:hit-touch";

/** The pill. A press shows the hover fill at once; neither applies while unavailable. */
const box = "rounded-full border transition-colors focus-ring";

/** Off: a `surface` pill with a `border-control` edge and `fg-muted` text. */
const boxOff =
  "border-border-control bg-surface not-aria-disabled:hover:bg-surface-subtle not-aria-disabled:active:bg-surface-subtle";
const textOff = "px-3 text-fg-muted";

/**
 * On: `accent-soft` with `accent-text` at 500 and a 12px check before the label, 8px in, so on
 * and off differ in shape too (23 A11). Its edge is transparent: in its own colour with more
 * contrast, and `CanvasText` in forced colours.
 */
const boxOn = "border-transparent bg-accent-soft contrast-more:border-accent-text";
const textOn = "pr-3 pl-2 font-medium text-accent-text";

/**
 * A picker chip ends in a 12px chevron, 4px after its words and 8px in. Picked, it's the on chip
 * without the check: the changed words show the state without colour (23 A11).
 */
const pickerOff = "pr-2 pl-3 text-fg-muted";
const pickerOn = "pr-2 pl-3 font-medium text-accent-text";

/** An unavailable toggle keeps its state but draws it in `fg-disabled`; its hint says why. */
const unavailableChip = "aria-disabled:cursor-not-allowed aria-disabled:text-fg-disabled";

/** 8px between chips, 16px between wrapped lines, padding 8px 16px. Never scrolls sideways. */
const rowClasses = "flex flex-wrap gap-x-2 gap-y-4 px-4 py-2";

/**
 * A row of chips that filters a list (component specs 15.7). With `options` it's one-of, a radio
 * group: the hub filter (All · acme · beta) when it's the page's only filter. With `toggles` it's
 * a row of picker chips (Search's In and Hub) and on/off chips, each a toggle button (Runs' Test
 * runs). The row wraps onto a second line.
 *
 * @example
 * <FilterChips
 *   label="Hub"
 *   options={[{ value: "all", label: "All" }, { value: "acme", label: "acme" }]}
 *   value={hub}
 *   onChange={setHub}
 * />
 */
export function FilterChips<Value extends string>(props: FilterChipsProps<Value>) {
  if (props.options === undefined) {
    return (
      // A fieldset is a group already; min-w-0 lets it wrap instead of growing to its content.
      <fieldset aria-label={props.label} className={`${rowClasses} m-0 min-w-0 border-0`}>
        {props.pickers?.map((picker) => (
          <PickerChip key={picker.label} picker={picker} />
        ))}
        {props.toggles?.map((toggle) => (
          <ToggleChip key={toggle.label} toggle={toggle} />
        ))}
      </fieldset>
    );
  }
  return <OneOfChips {...props} />;
}

/** Native radios that share one name, so Tab stops once and the arrow keys move the choice. */
function OneOfChips<Value extends string>(props: FilterChipsOneOf<Value>) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={props.label} className={rowClasses}>
      {props.options.map((option) => {
        const on = option.value === props.value;
        return (
          // The radio itself is the pill, with its fill, edge and focus ring; the words sit above
          // it and let presses through. On a phone the label's 48px hit area lies over the
          // radio, so hover and press fill the pill through the label.
          <label key={option.value} className={`group ${chipSize} ${on ? textOn : textOff}`}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={on}
              className={`absolute inset-0 m-0 size-full cursor-pointer appearance-none ${box} ${on ? boxOn : `${boxOff} group-hover:bg-surface-subtle group-active:bg-surface-subtle`}`}
              onChange={() => props.onChange(option.value)}
            />
            <span className="pointer-events-none relative inline-flex items-center gap-1">
              {on ? <ChipCheck /> : null}
              {option.label}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function ToggleChip({ toggle }: { readonly toggle: FilterToggle }) {
  const unavailable = toggle.unavailable !== undefined;
  function press(event: MouseEvent<HTMLButtonElement>) {
    if (unavailable) {
      event.preventDefault();
      return;
    }
    toggle.onChange(!toggle.pressed);
  }
  const look = toggle.pressed ? `${boxOn} ${textOn}` : `${boxOff} ${textOff}`;
  return (
    <button
      type="button"
      aria-pressed={toggle.pressed}
      aria-disabled={unavailable || undefined}
      aria-describedby={toggle.unavailable?.reason}
      className={`${chipSize} ${box} ${look} ${unavailableChip}`}
      onClick={press}
    >
      {toggle.pressed ? <ChipCheck /> : null}
      {toggle.label}
    </button>
  );
}

/**
 * A picker chip, named by its label and its words ("Hub: All hubs"), so the words it shows are in
 * its name (2.5.3). On desktop it opens a Menu of radio items; on a phone (the presentation
 * context) the picker sheet, titled with the label. Either way the "all" option comes first, the
 * current one has the check, a pick closes the list and calls `onChange`, and focus goes back to
 * the chip. Closing the sheet keeps the old value.
 */
function PickerChip({ picker }: { readonly picker: FilterPicker }) {
  const phone = usePresentation() === "phone";
  const [open, setOpen] = useState(false);
  // The "all" option's value in the list: a fresh id, so no real value can be the same.
  const all = useId();
  const picked = picker.options.find((option) => option.value === picker.value);
  const words = picked?.label ?? picker.all;
  const options = [{ value: all, label: picker.all }, ...picker.options];
  const current = picked?.value ?? all;
  const choose = (value: string) => picker.onChange(value === all ? undefined : value);
  const look = { name: `${picker.label}: ${words}`, words, on: picked !== undefined };

  if (!phone) {
    const entries: readonly MenuEntry[] = options.map((option) => ({
      id: option.value,
      label: option.label,
      checked: option.value === current,
      onSelect: () => choose(option.value),
    }));
    return (
      <Menu trigger={(props) => <PickerChipButton {...props} {...look} />} entries={entries} />
    );
  }
  return (
    <>
      <PickerChipButton {...look} aria-haspopup="dialog" onClick={() => setOpen(true)} />
      {open ? (
        <PickerSheet
          title={picker.label}
          options={options}
          value={current}
          empty={picker.all}
          onPick={(value) => {
            setOpen(false);
            choose(value);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

type PickerChipButtonProps = (MenuTriggerProps | { readonly "aria-haspopup": "dialog" }) & {
  readonly name: string;
  readonly words: string;
  readonly on: boolean;
  readonly onClick?: () => void;
};

function PickerChipButton({ name, words, on, ...props }: PickerChipButtonProps) {
  return (
    <button
      type="button"
      {...props}
      aria-label={name}
      className={`${chipSize} ${box} ${on ? `${boxOn} ${pickerOn}` : `${boxOff} ${pickerOff}`}`}
    >
      {/* Long values end in an ellipsis at 160px. */}
      <span className="min-w-0 max-w-40 truncate">{words}</span>
      <span
        aria-hidden="true"
        className="inline-grid size-3 shrink-0 place-items-center *:size-full"
      >
        <ChevronDownIcon />
      </span>
    </button>
  );
}

/** The on chip's 12px check before its label. Decoration: the role carries the state. */
function ChipCheck() {
  return (
    <span aria-hidden="true" className="inline-grid size-3 shrink-0 place-items-center *:size-full">
      <TickIcon />
    </span>
  );
}
