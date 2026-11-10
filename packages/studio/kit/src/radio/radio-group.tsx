import { type ReactNode, useId } from "react";
import { useFieldControl } from "../field/field.tsx";

interface RadioOptionBase<Value extends string> {
  readonly value: Value;
  /** The option's words: "Local command". The whole label is the target. */
  readonly label: ReactNode;
  /**
   * What the picked option needs next (an address, a command), under its label. Only the picked
   * option's field is rendered; the screen keeps what was typed in the others.
   */
  readonly field?: ReactNode;
}

/** An option that can be picked, with an optional note on what it means. */
interface RadioOptionAvailable<Value extends string> extends RadioOptionBase<Value> {
  /** A short line after the label: "Runs a program on this computer." */
  readonly note?: ReactNode;
  readonly unavailable?: false;
}

/** An option that can't be picked now. It stays listed, and its note says why. */
interface RadioOptionUnavailable<Value extends string> extends RadioOptionBase<Value> {
  /** Why it can't be picked: "Needs Docker." Never only a tooltip. */
  readonly note: ReactNode;
  readonly unavailable: true;
}

/** One choice in a RadioGroup. */
export type RadioOption<Value extends string = string> =
  | RadioOptionAvailable<Value>
  | RadioOptionUnavailable<Value>;

export interface RadioGroupProps<Value extends string> {
  /** A few choices, shown all at once. For a long list, use a Select. */
  readonly options: readonly RadioOption<Value>[];
  /** The picked option's value, or `null` when none is picked yet. */
  readonly value: Value | null;
  /** Called with the option the user picks. On a page this saves at once, like a Switch. */
  readonly onChange: (value: Value) => void;
  /** Its name when it isn't in a Field. In a Field, the Field's label names the group. */
  readonly label?: string;
}

/**
 * The 16px circle, 2px down (4px on a phone's 24px lines) so it lines up with the first line of
 * its label: the Checkbox's
 * `border-control` edge on `surface`. Picked, a 5px `primary` ring round an `on-primary` centre
 * (white in light, ink in dark, as the Switch's thumb). In high contrast `radio-forced` draws the
 * ring `Highlight`.
 */
const circleShared = [
  "m-0 mt-0.5 size-4 shrink-0 phone:mt-1 appearance-none rounded-full border bg-surface",
  "transition-colors focus-ring radio-forced",
  "checked:border-5 checked:border-primary checked:bg-on-primary",
].join(" ");

const circleStateClasses = {
  // The pointer over the circle or its label: an empty edge turns fg-muted, a ring primary-hover.
  default: [
    "cursor-pointer border-border-control",
    "hover:border-fg-muted group-hover/radio:border-fg-muted",
    "checked:hover:border-primary-hover checked:group-hover/radio:border-primary-hover",
  ].join(" "),
  invalid: "cursor-pointer border-danger",
  unavailable: "cursor-not-allowed border-border-control",
} as const;

/**
 * 45% on the circle and the words (60% with more contrast), `GrayText` at full strength in high
 * contrast. The note keeps its full strength, because it says why.
 */
const unavailableFade = "opacity-45 contrast-more:opacity-60 forced-colors:opacity-100";

/**
 * One choice out of a few, shown all at once: how agents look things up, the ways to connect. A
 * `role="radiogroup"` of native radios, so Tab reaches it once and the arrow keys move the
 * choice. In a Field the Field's label names it and the Field's error sits under it; with an
 * error and nothing picked, every circle takes a `danger` edge.
 *
 * @example
 * <Field label="Connect with" error={connectError}>
 *   <RadioGroup
 *     value={way}
 *     onChange={setWay}
 *     options={[
 *       { value: "address", label: "Web address", field: <Input value={address} onChange={…} /> },
 *       { value: "command", label: "Local command", note: "Runs a program on this computer." },
 *       { value: "docker", label: "Docker image", note: "Needs Docker.", unavailable: true },
 *     ]}
 *   />
 * </Field>
 */
export function RadioGroup<Value extends string>({
  options,
  value,
  onChange,
  label,
}: RadioGroupProps<Value>) {
  const field = useFieldControl();
  const name = useId();
  const invalid = field?.invalid === true;
  const picked = options.find((option) => option.value === value);
  const spaced = picked?.field !== undefined;

  return (
    <div
      role="radiogroup"
      id={field?.id}
      aria-label={field === undefined ? label : undefined}
      aria-labelledby={field?.labelId}
      aria-describedby={field?.describedBy}
      aria-invalid={invalid ? true : undefined}
      aria-required={field?.required === true ? true : undefined}
      className={`flex flex-col phone:gap-0 touch:gap-0 ${spaced ? "gap-3" : "gap-2"}`}
    >
      {options.map((option) => (
        <RadioRow
          key={option.value}
          option={option}
          name={name}
          checked={option.value === value}
          invalid={invalid && value === null}
          onPick={() => onChange(option.value)}
        />
      ))}
    </div>
  );
}

interface RadioRowProps<Value extends string> {
  readonly option: RadioOption<Value>;
  readonly name: string;
  readonly checked: boolean;
  readonly invalid: boolean;
  readonly onPick: () => void;
}

/** One option: its circle, label and note, and its field under it while it's picked. */
function RadioRow<Value extends string>({
  option,
  name,
  checked,
  invalid,
  onPick,
}: RadioRowProps<Value>) {
  const labelId = useId();
  const noteId = useId();
  const unavailable = option.unavailable === true;
  const hasNote = option.note !== undefined && option.note !== null;
  let state: keyof typeof circleStateClasses = "default";
  if (unavailable) {
    state = "unavailable";
  } else if (invalid) {
    state = "invalid";
  }

  return (
    <div className="flex flex-col">
      <label
        // On a phone or a touch screen the whole row is the target, at least 48px high.
        className={`group/radio flex items-start gap-2 text-body phone:min-h-touch phone:py-3 phone:text-input-touch touch:min-h-touch touch:py-3 ${unavailable ? "cursor-not-allowed text-forced-disabled" : "cursor-pointer text-fg"}`}
      >
        <input
          type="radio"
          name={name}
          value={option.value}
          checked={checked}
          // An option that can't be picked is native `disabled`, so the arrow keys skip it
          // (component specs 19.1). Its reason is the note next to it, which describes it.
          disabled={unavailable}
          // Named by its words alone: the note sits in the label too, but it is the description,
          // so a screen reader reads it once.
          aria-labelledby={labelId}
          aria-describedby={hasNote ? noteId : undefined}
          className={`${circleShared} ${circleStateClasses[state]} ${unavailable ? unavailableFade : ""}`}
          onChange={onPick}
        />
        <span className="min-w-0">
          <span id={labelId} className={unavailable ? unavailableFade : undefined}>
            {option.label}
          </span>
          {hasNote ? (
            <span id={noteId} className="block text-small text-fg-subtle">
              {option.note}
            </span>
          ) : null}
        </span>
      </label>
      {checked && option.field !== undefined ? (
        <div className="mt-2 pl-6">{option.field}</div>
      ) : null}
    </div>
  );
}
