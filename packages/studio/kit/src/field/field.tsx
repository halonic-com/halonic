import { createContext, type ReactNode, useContext, useId } from "react";
import { AlertIcon } from "../icons/alert-icon.tsx";

/** What a Field tells the control inside it, so screens never wire ids by hand. */
export interface FieldControl {
  /** The control's `id`, which the label points at. */
  readonly id: string;
  /** The `id` of the hint or the error under the control, for `aria-describedby`. */
  readonly describedBy: string | undefined;
  /** True while the Field shows an error: the control sets `aria-invalid`. */
  readonly invalid: boolean;
  readonly required: boolean;
}

const FieldControlContext = createContext<FieldControl | undefined>(undefined);

/** The Field around a control, or `undefined` when the control stands alone. */
export function useFieldControl(): FieldControl | undefined {
  return useContext(FieldControlContext);
}

export interface FieldProps {
  /** Always there, above the control. It's the control's name: "Name", "Model". */
  readonly label: string;
  /** Hides the label from sight but not from screen readers. Only for a search in a toolbar. */
  readonly hideLabel?: boolean;
  /** A short line under the control. An error takes its place. Empty counts as none. */
  readonly hint?: ReactNode;
  /**
   * A sentence that says what to do: "Give the agent a name." Shown under the control. Empty
   * counts as none, so a screen can start its error state at `""`.
   */
  readonly error?: string | null;
  /** Adds the word "Required" after the label. No asterisk. */
  readonly required?: boolean;
  /** One kit control: an Input, a TextArea or a Select. */
  readonly children: ReactNode;
}

/**
 * A label, a control and a hint or an error under it. The Field gives the control its `id`,
 * `aria-describedby` and `aria-invalid`, so a screen never writes them itself.
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
  error,
  required = false,
  children,
}: FieldProps) {
  const id = useId();
  const controlId = `${id}-control`;
  const lineId = `${id}-line`;
  const invalid = isShown(error);
  const hasLine = invalid || isShown(hint);

  const control: FieldControl = {
    id: controlId,
    describedBy: hasLine ? lineId : undefined,
    invalid,
    required,
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={controlId} className={hideLabel ? "sr-only" : "text-caption text-fg-muted"}>
        {label}
        {/* Hidden from screen readers, which already hear "required" from aria-required. */}
        {required ? (
          <span className="text-fg-subtle" aria-hidden="true">
            {" "}
            Required
          </span>
        ) : null}
      </label>
      <FieldControlContext value={control}>{children}</FieldControlContext>
      <FieldLine id={lineId} hint={hint} error={error} />
    </div>
  );
}

/** The line under the control: the error with its icon, else the hint, else nothing. */
function FieldLine({
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
