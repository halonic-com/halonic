import { createContext, type ReactNode, useContext, useId, useRef } from "react";
import { AlertIcon } from "../icons/alert-icon.tsx";
import { useFieldErrorAnnouncement } from "./field-announce.tsx";
import { useFormRows } from "./form-rows.tsx";
import { labelClass, SIDE, SideRow } from "./side-row.tsx";

/** What a Field tells the control inside it, so screens never wire ids by hand. */
export interface FieldControl {
  /** The control's `id`, which the label points at. */
  readonly id: string;
  /** The label's `id`, for a group that a label can't point at: `aria-labelledby` (RadioGroup). */
  readonly labelId: string;
  /** The `id` of the hint or the error line, for `aria-describedby`. */
  readonly describedBy: string | undefined;
  /** True while the Field shows an error: the control sets `aria-invalid`. */
  readonly invalid: boolean;
  readonly required: boolean;
  /** The label's words, for a control that shows them again: the text sheet's title. */
  readonly label: string;
  /** The hint and the error themselves, for a control that shows them again: the text sheet. */
  readonly hint: ReactNode;
  readonly error: string | undefined;
}

const FieldControlContext = createContext<FieldControl | undefined>(undefined);

/** The Field around a control, or `undefined` when the control stands alone. */
export function useFieldControl(): FieldControl | undefined {
  return useContext(FieldControlContext);
}

/** A currency or a unit outside the box, before it (component specs 18.2). */
export interface FieldPrefix {
  /** What's shown: "€", from `Intl.NumberFormat(…).formatToParts`. Screen readers skip it. */
  readonly symbol: string;
  /**
   * What screen readers hear after the label instead: "in euros", from the message catalogue.
   * The Field never guesses it from the symbol, because the currency can change.
   */
  readonly name: string;
}

/** The props of `Field`. */
export interface FieldProps {
  /** Always there, above the control. It's the control's name: "Name", "Model". */
  readonly label: string;
  /** Hides the label from sight but not from screen readers. Only for a search in a toolbar. */
  readonly hideLabel?: boolean;
  /** A short line under the control. An error takes its place. Empty counts as none. */
  readonly hint?: ReactNode;
  /**
   * Puts the hint, and an error in its place, between the label and the control. For a group
   * whose options have notes of their own (a RadioGroup), where a hint under the last option
   * reads as that option's. It stays the control's description.
   */
  readonly hintAbove?: boolean;
  /**
   * A sentence that says what to do: "Give the agent a name." Shown under the control. Empty
   * counts as none, so a screen can start its error state at `""`.
   */
  readonly error?: string | null;
  /**
   * A symbol outside the box, 8px before it: "€". The label gets its `name` as hidden text, so
   * the control is read "Per run, in euros". The hint and error still start at the Field's edge.
   */
  readonly prefix?: FieldPrefix;
  /** Adds the word "Required" after the label. No asterisk. */
  readonly required?: boolean;
  /**
   * `"side"` puts the label in a column on the left (specs 19.2). Inside FormRows every Field is
   * `"side"` without the prop. Narrower than 46.5rem it falls back to label over value.
   */
  readonly layout?: "stack" | "side";
  /**
   * Side layout only. `"text"` when the value is text, not a control (a read-only value, a list
   * of files), so the label isn't moved down to a 32px control's text line.
   */
  readonly align?: "control" | "text";
  /** Side layout only. Drops the value column's 560px limit, for long text (Instructions). */
  readonly wide?: boolean;
  /**
   * For a field that checks its value after a pause in typing: an error that appears while focus
   * is still in the field is announced too, once (WCAG 4.1.3). Without it, only an error that
   * appears after focus has left the Field is announced.
   */
  readonly announceWhileFocused?: boolean;
  /** One kit control: an Input, a TextArea or a Select. */
  readonly children: ReactNode;
}

/**
 * A label, a control and a hint or an error under it. The Field gives the control its `id`,
 * `aria-describedby` and `aria-invalid`, so a screen never writes them itself. Inside a
 * `FieldAnnounceProvider`, an error that appears after focus has left the Field is announced, and
 * with `announceWhileFocused` one that appears while focus is inside it too.
 *
 * @example
 * <Field label="Name" hint="Shown in the sidebar." error={nameError} required>
 *   <Input value={name} onChange={(event) => setName(event.target.value)} />
 * </Field>
 */
export function Field({
  label,
  hideLabel = false,
  hint,
  hintAbove = false,
  error,
  required = false,
  prefix,
  layout,
  align = "control",
  wide = false,
  announceWhileFocused = false,
  children,
}: FieldProps) {
  const rows = useFormRows();
  const id = useId();
  const controlId = `${id}-control`;
  const labelId = `${id}-label`;
  const lineId = `${id}-line`;
  const invalid = isShown(error);
  const hasLine = invalid || isShown(hint);
  const wrapper = useRef<HTMLDivElement>(null);
  useFieldErrorAnnouncement(
    wrapper,
    label,
    invalid ? (error ?? undefined) : undefined,
    announceWhileFocused,
  );

  const control: FieldControl = {
    id: controlId,
    labelId,
    describedBy: hasLine ? lineId : undefined,
    invalid,
    required,
    label,
    hint: isShown(hint) ? hint : undefined,
    error: invalid ? (error ?? undefined) : undefined,
  };

  const side = (layout ?? (rows === undefined ? "stack" : "side")) === "side";
  const look = side ? SIDE[rows ?? "sheet"] : undefined;
  // A side label lines up with the first line of the value column, which is then text.
  const labelAlign = hintAbove && hasLine ? "text" : align;
  const fieldLabel = (
    <label id={labelId} htmlFor={controlId} className={labelClass(hideLabel, look, labelAlign)}>
      <LabelWords label={label} prefix={prefix} required={required} />
    </label>
  );
  const value = (
    <FieldValue
      control={control}
      prefix={prefix}
      line={<FieldLine id={lineId} hint={hint} error={error} />}
      lineAbove={hintAbove}
    >
      {children}
    </FieldValue>
  );

  if (look === undefined) {
    return (
      <div ref={wrapper} className="flex flex-col gap-1">
        {fieldLabel}
        {value}
      </div>
    );
  }
  return <SideRow ref={wrapper} look={look} wide={wide} label={fieldLabel} value={value} />;
}

/** The control, after the prefix's symbol when there is one, with the line under it or above. */
function FieldValue({
  control,
  prefix,
  line,
  lineAbove,
  children,
}: {
  control: FieldControl;
  prefix: FieldPrefix | undefined;
  line: ReactNode;
  lineAbove: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {lineAbove ? line : null}
      <FieldControlContext value={control}>
        {prefix === undefined ? (
          children
        ) : (
          <PrefixRow symbol={prefix.symbol} controlId={control.id}>
            {children}
          </PrefixRow>
        )}
      </FieldControlContext>
      {lineAbove ? null : line}
    </>
  );
}

/** The label's words, the prefix's name for screen readers, and the visible "Required". */
function LabelWords({
  label,
  prefix,
  required,
}: {
  label: string;
  prefix: FieldPrefix | undefined;
  required: boolean;
}) {
  return (
    <>
      {label}
      {prefix === undefined ? null : <span className="sr-only">{`, ${prefix.name}`}</span>}
      {/* Hidden from screen readers, which already hear "required" from aria-required. */}
      {required ? (
        <span className="text-fg-subtle" aria-hidden="true">
          {" "}
          Required
        </span>
      ) : null}
    </>
  );
}

/**
 * The symbol 8px before the box, centred on it, and the box taking the rest of the row. Only the
 * control is in the row: the hint and the error go under it, from the Field's left edge.
 */
function PrefixRow({
  symbol,
  controlId,
  children,
}: {
  symbol: string;
  controlId: string;
  children: ReactNode;
}) {
  // Like the label, the symbol is part of the target: tapping it focuses the control. Keyboard
  // and screen reader users reach the control itself; the label already says the symbol's name.
  const focusControl = () => document.getElementById(controlId)?.focus();
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="shrink-0 text-body text-fg-muted" onClick={focusControl}>
        {symbol}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * The line under the control: the error with its icon, else the hint, else nothing. The text
 * sheet draws its field's line with it too.
 */
export function FieldLine({
  id,
  hint,
  error,
}: {
  id: string;
  hint: ReactNode;
  error: string | null | undefined;
}) {
  if (isShown(error)) {
    return (
      <p id={id} className="flex items-start gap-1 text-caption text-danger">
        <span className="inline-grid size-icon-sm shrink-0 place-items-center *:size-full">
          <AlertIcon />
        </span>
        {error}
      </p>
    );
  }
  if (isShown(hint)) {
    return (
      <p id={id} className="text-caption text-fg-subtle">
        {hint}
      </p>
    );
  }
  return null;
}

/** Whether a hint or an error has something to show: not absent, `null`, `false` or `""`. */
function isShown(value: ReactNode): boolean {
  return value !== undefined && value !== null && value !== false && value !== "";
}
