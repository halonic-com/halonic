import { type KeyboardEvent, useId, useRef, useState } from "react";
import { TickIcon } from "../icons/tick-icon.tsx";
import { Input } from "../input/input.tsx";
import { SheetFrame } from "../sheet/sheet-frame.tsx";

/** One option of a picker sheet. */
export interface PickerOption<Value extends string = string> {
  readonly value: Value;
  /** "Sonnet", "acme". The option's name. */
  readonly label: string;
  /** A second line: a price, "Full access". */
  readonly description?: string;
  /**
   * The option can't be picked. It stays listed, with the reason as its description, so it's
   * never hidden: "Needs an Anthropic key."
   */
  readonly unavailable?: { readonly reason: string };
}

/** The props of `PickerSheet`. */
export interface PickerSheetProps<Value extends string = string> {
  /** The field's label: "Model", "Hub". */
  readonly title: string;
  readonly options: readonly PickerOption<Value>[];
  /** The value the field had when the sheet opened, or `undefined` for none. */
  readonly value: Value | undefined;
  /**
   * A tap, Enter or Space picked an option: the screen saves it, as on desktop, and unmounts
   * the sheet.
   */
  readonly onPick: (value: Value) => void;
  /** Close, Escape or Android back: the screen unmounts the sheet and the value stays. */
  readonly onClose: () => void;
  /** An optional line at the top: "Only models that Claude Code can use." */
  readonly explanation?: string;
  /** With no options: what's missing and where to add it. */
  readonly empty: string;
  /** Where focus goes on close when the opener has gone (component specs 23 A2). */
  readonly returnFocus?: () => HTMLElement | null;
}

/** From this many options, the sheet shows a search field. */
export const PICKER_SEARCH_FROM = 11;

const arrowKeys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/**
 * The phone's picker (component specs 15.3): a full-screen sheet with Close at the top left and
 * the field's label as its title, used by the Select on a phone, the filter chips' picker and the
 * "add" pickers. The options are native radios in a flush list, so screen readers work as for
 * any radio group. The arrow keys move the check without closing; a tap, Enter or Space picks
 * and closes. Close puts back the value it had, since nothing is picked until then.
 *
 * @example
 * {picking ? (
 *   <PickerSheet title="Model" options={models} value={model} empty="No models yet. Add a
 *     provider in Settings." onPick={(next) => { save(next); setPicking(false); }}
 *     onClose={() => setPicking(false)} />
 * ) : null}
 */
export function PickerSheet<Value extends string>(props: PickerSheetProps<Value>) {
  const name = useId();
  const groupLabel = useId();
  const [checked, setChecked] = useState(props.value);
  const [search, setSearch] = useState("");
  // Native radios fire `click` when an arrow key moves the check, so a click in the same task
  // as an arrow key is a move, not a pick.
  const arrowing = useRef(false);
  const picked = useRef(false);

  function pick(value: Value) {
    const option = props.options.find((candidate) => candidate.value === value);
    if (picked.current || option === undefined || option.unavailable !== undefined) {
      return;
    }
    picked.current = true;
    props.onPick(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>, value: Value) {
    if (arrowKeys.has(event.key)) {
      arrowing.current = true;
      setTimeout(() => {
        arrowing.current = false;
      });
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(value);
    }
  }

  const shown = filter(props.options, search);
  const searchable = props.options.length >= PICKER_SEARCH_FROM;

  return (
    <SheetFrame
      title={props.title}
      onClose={props.onClose}
      onCancel={props.onClose}
      {...(props.returnFocus === undefined ? {} : { returnFocus: props.returnFocus })}
    >
      {props.explanation === undefined && !searchable ? null : (
        <div className="flex flex-col gap-3 px-4 pt-3 pb-2">
          {props.explanation === undefined ? null : (
            <p className="text-small text-fg-muted">{props.explanation}</p>
          )}
          {searchable ? (
            <Input
              type="search"
              aria-label={`Search ${props.title}`}
              enterKeyHint="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          ) : null}
        </div>
      )}
      {props.options.length === 0 ? (
        <p className="px-4 py-3 text-body text-fg-muted">{props.empty}</p>
      ) : (
        <div role="radiogroup" aria-labelledby={groupLabel}>
          <span id={groupLabel} hidden>
            {props.title}
          </span>
          {shown.map((option) => (
            <PickerRow
              key={option.value}
              option={option}
              name={name}
              checked={option.value === checked}
              onCheck={() => setChecked(option.value)}
              onClick={() => {
                if (!arrowing.current) {
                  pick(option.value);
                }
              }}
              onKeyDown={(event) => onKeyDown(event, option.value)}
            />
          ))}
        </div>
      )}
    </SheetFrame>
  );
}

interface PickerRowProps<Value extends string> {
  readonly option: PickerOption<Value>;
  readonly name: string;
  readonly checked: boolean;
  readonly onCheck: () => void;
  readonly onClick: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * A `dense` flush List row: padded 8px 16px, 56px with a description line and 48px without, with a
 * 1px `border` line under it, the last row too. The radio itself is the row's target and carries
 * its fill and focus ring; the words sit above it and let taps through. The picked option has a 20px `accent` check at the right edge.
 */
function PickerRow<Value extends string>(props: PickerRowProps<Value>) {
  const labelId = useId();
  const descriptionId = useId();
  const { option } = props;
  // An unavailable option without words for why (a Select's) has no second line.
  const reason = option.unavailable?.reason === "" ? undefined : option.unavailable?.reason;
  const description = reason ?? option.description;
  const unavailable = option.unavailable !== undefined;
  return (
    <div
      className={`relative flex items-center gap-3 border-b border-border px-4 py-2 ${description === undefined ? "min-h-touch" : "min-h-14"}`}
    >
      <input
        type="radio"
        name={props.name}
        value={option.value}
        checked={props.checked}
        disabled={unavailable}
        aria-labelledby={labelId}
        aria-describedby={description === undefined ? undefined : descriptionId}
        className={[
          "absolute inset-0 m-0 size-full cursor-pointer appearance-none transition-colors",
          "focus-ring-inset hover:bg-surface-subtle active:bg-surface-subtle",
          "disabled:cursor-not-allowed disabled:bg-transparent",
        ].join(" ")}
        onChange={props.onCheck}
        onClick={props.onClick}
        onKeyDown={props.onKeyDown}
      />
      <span
        className={`pointer-events-none relative flex min-w-0 flex-1 flex-col ${unavailable ? "text-fg-disabled" : ""}`}
      >
        <span id={labelId} className="text-body wrap-break-word">
          {option.label}
        </span>
        {description === undefined ? null : (
          <span id={descriptionId} className="text-small text-fg-muted wrap-break-word">
            {description}
          </span>
        )}
      </span>
      {props.checked ? (
        <span className="pointer-events-none relative size-icon-md shrink-0 text-accent *:size-full">
          <TickIcon />
        </span>
      ) : null}
    </div>
  );
}

function filter<Value extends string>(
  options: readonly PickerOption<Value>[],
  search: string,
): readonly PickerOption<Value>[] {
  const words = search.trim().toLocaleLowerCase();
  if (words === "") {
    return options;
  }
  return options.filter((option) => option.label.toLocaleLowerCase().includes(words));
}
