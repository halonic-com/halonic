import { type ChangeEvent, type Ref, useId, useState } from "react";
import { assignRef } from "../field/control.ts";
import { useFieldControl } from "../field/field.tsx";
import { ChevronDownIcon } from "../icons/chevron-down-icon.tsx";
import { type FieldSize, fieldBoxClasses, fieldBoxState } from "../input/field-box.ts";
import { type PickerOption, PickerSheet } from "../picker-sheet/picker-sheet.tsx";
import { usePresentation } from "../presentation/presentation.tsx";

/** One value to pick: what's saved, and the words the list shows for it. */
export interface SelectOption {
  readonly value: string;
  readonly label: string;
  /** Stays in the list, greyed, and can't be picked. */
  readonly disabled?: boolean;
  /**
   * Why a `disabled` option can't be picked: "Needs an Anthropic key." The phone's picker sheet
   * shows it under the option; the desktop's native list has no room for it.
   */
  readonly reason?: string;
}

export interface SelectProps {
  /** The values to pick from, in the order the list shows them. */
  readonly options: readonly SelectOption[];
  /** The picked value. One that isn't in `options` shows the placeholder instead. */
  readonly value: string;
  /** Called with the new value as soon as the user picks it. */
  readonly onChange: (value: string) => void;
  /**
   * Shown while `value` isn't one of the options: "Choose a model" when the file names a model
   * that no longer exists. It's in the list too, and can't be picked.
   */
  readonly placeholder?: string;
  /** `md` 32px (the default) or `sm` 28px. Both are 48px on a phone. */
  readonly size?: FieldSize;
  readonly disabled?: boolean;
  /** The form field's name, for a form that posts its data. */
  readonly name?: string;
  /** The name, for a Select outside a Field. Inside one the Field's label names it. */
  readonly "aria-label"?: string;
  /** The phone's picker sheet with no options: what's missing and where to add it. */
  readonly emptyText?: string;
  /** The control you focus: the `<select>` on desktop, the picker button on a phone. */
  readonly ref?: Ref<HTMLElement>;
}

/**
 * The control covers the whole box, padding included, so a press anywhere in it opens the list.
 * Its end padding leaves room for the chevron: 32px, and 36px with the phone's 12px padding.
 */
const controlClasses = [
  "-mx-2.5 min-w-0 flex-1 self-stretch ps-2.5 pe-8 phone:-mx-3 phone:ps-3 phone:pe-9",
  "bg-transparent text-body outline-none phone:text-input-touch touch:text-input-touch",
  "disabled:cursor-not-allowed disabled:text-fg-disabled",
].join(" ");

/** Options in the theme's colours, so the system list isn't light text on a light fill. */
const optionClasses = "bg-surface text-fg";

/**
 * Pick one value from a list. Put it in a `Field`, which gives it its label, its hint or error,
 * and the ids that link them. On desktop it's the native `<select>`, so the keyboard and screen
 * readers work as everywhere. On a phone (the presentation context) it's a picker button, named
 * by the label and the value ("Model, Sonnet"), which opens the kit's picker sheet.
 *
 * @example
 * <Field label="Model" error={modelError}>
 *   <Select options={models} value={model} onChange={setModel} placeholder="Choose a model" />
 * </Field>
 */
export function Select({
  options,
  value,
  onChange,
  placeholder,
  size = "md",
  disabled,
  name,
  "aria-label": ariaLabel,
  emptyText = "",
  ref,
}: SelectProps) {
  const field = useFieldControl();
  const phone = usePresentation() === "phone";
  const invalid = field?.invalid ?? false;
  const state = fieldBoxState({ disabled, invalid, readOnly: undefined });
  const picked = options.find((option) => option.value === value);

  const list = (
    <>
      {picked === undefined ? (
        <option value="" disabled className={optionClasses}>
          {placeholder ?? ""}
        </option>
      ) : null}
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={optionClasses}
        >
          {option.label}
        </option>
      ))}
    </>
  );
  const shown = picked === undefined ? "" : value;
  // The placeholder is an example, never a value: it takes the placeholder's colour.
  const tone = picked === undefined ? "text-fg-subtle" : "text-fg";
  const pick = (event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value);

  return (
    <div className={`relative ${fieldBoxClasses(state, size)}`}>
      {phone ? (
        <PickerButton
          label={picked?.label ?? placeholder ?? ""}
          tone={tone}
          disabled={disabled}
          name={name}
          ariaLabel={ariaLabel}
          options={options}
          value={picked?.value}
          onChange={onChange}
          emptyText={emptyText}
          controlRef={ref}
        />
      ) : (
        <select
          ref={(node) => assignRef(ref, node)}
          id={field?.id}
          name={name}
          value={shown}
          disabled={disabled}
          onChange={pick}
          data-field-text=""
          className={`${controlClasses} appearance-none ${tone}`}
          aria-label={ariaLabel}
          aria-describedby={field?.describedBy}
          aria-invalid={invalid || undefined}
          aria-required={field?.required || undefined}
        >
          {list}
        </select>
      )}
      {/* 20px on a phone, like the folded LongText's chevron; 16px on desktop. */}
      <span
        className={`pointer-events-none absolute end-2.5 top-1/2 inline-grid ${phone ? "size-icon-md" : "size-icon-sm"} -translate-y-1/2 place-items-center text-fg-muted *:size-full phone:end-3`}
        aria-hidden="true"
      >
        <ChevronDownIcon />
      </span>
    </div>
  );
}

interface PickerButtonProps {
  /** The picked option's words, or the placeholder. */
  readonly label: string;
  readonly tone: string;
  readonly disabled: boolean | undefined;
  readonly name: string | undefined;
  readonly ariaLabel: string | undefined;
  readonly options: readonly SelectOption[];
  /** The picked value, or `undefined` while the placeholder shows. */
  readonly value: string | undefined;
  readonly onChange: (value: string) => void;
  readonly emptyText: string;
  readonly controlRef: Ref<HTMLElement> | undefined;
}

/**
 * The phone's field: a button that looks like the phone Input and opens the picker sheet, titled
 * with the Field's label. A pick saves at once and closes it; Close keeps the value. Either way
 * focus goes back to the button. An unavailable option stays listed, with its reason under it,
 * and can't be picked.
 */
function PickerButton({
  label,
  tone,
  disabled,
  name,
  ariaLabel,
  options,
  value,
  onChange,
  emptyText,
  controlRef,
}: PickerButtonProps) {
  const field = useFieldControl();
  const id = useId();
  const nameId = `${id}-name`;
  const valueId = `${id}-value`;
  const [open, setOpen] = useState(false);
  // "Model, Sonnet": the Field's label, or the aria-label outside one, then the value.
  const labelledBy = [field?.labelId ?? (ariaLabel === undefined ? undefined : nameId), valueId]
    .filter((part) => part !== undefined)
    .join(" ");
  const choices: readonly PickerOption[] = options.map((option) => ({
    value: option.value,
    label: option.label,
    // Without a reason, the unavailable option's row has no second line.
    ...(option.disabled === true ? { unavailable: { reason: option.reason ?? "" } } : {}),
  }));

  return (
    <>
      <button
        ref={(node) => assignRef(controlRef, node)}
        type="button"
        id={field?.id}
        disabled={disabled}
        onClick={() => setOpen(true)}
        data-field-text=""
        className={`${controlClasses} flex items-center text-start phone:py-3`}
        aria-haspopup="dialog"
        aria-labelledby={labelledBy}
        aria-describedby={field?.describedBy}
      >
        <span id={valueId} className={`min-w-0 break-words ${tone}`}>
          {label}
        </span>
      </button>
      {field === undefined && ariaLabel !== undefined ? (
        <span id={nameId} hidden>
          {ariaLabel}
        </span>
      ) : null}
      {name === undefined ? null : (
        <input type="hidden" name={name} value={value ?? ""} disabled={disabled} />
      )}
      {open ? (
        <PickerSheet
          title={field?.label ?? ariaLabel ?? ""}
          options={choices}
          value={value}
          empty={emptyText}
          onPick={(picked) => {
            setOpen(false);
            onChange(picked);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
