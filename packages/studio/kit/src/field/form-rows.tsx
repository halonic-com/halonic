import { createContext, type ReactNode, useContext } from "react";

/** How a Field inside FormRows lays out: a settings sheet, or the tighter rows inside a Card. */
export type FormRowsKind = "sheet" | "card";

const FormRowsContext = createContext<FormRowsKind | undefined>(undefined);

/** The FormRows round a Field, or `undefined` when the Field isn't in one. */
export function useFormRows(): FormRowsKind | undefined {
  return useContext(FormRowsContext);
}

/** The props of `FormRows`. */
export interface FormRowsProps {
  /**
   * Rows inside a Card (a routine's When and Starts cards): a 120px label column, 12px between
   * rows and no dividers, because the card is the box.
   */
  readonly inCard?: boolean;
  /** Fields. Each one takes `layout="side"` from the rows, so a screen never writes it. */
  readonly children: ReactNode;
}

/**
 * Side-label rows for a wide item page: the label in a column on the left, the value on the
 * right, a 1px line between rows. Narrower than 46.5rem, every Field falls back to label over
 * value by itself, through a container query, so nothing reads the window width.
 *
 * @example
 * <FormRows>
 *   <Field label="Name" required>
 *     <Input value={name} onChange={(event) => setName(event.target.value)} />
 *   </Field>
 *   <Field label="Instructions" wide>
 *     <TextArea value={instructions} onChange={(event) => setInstructions(event.target.value)} />
 *   </Field>
 * </FormRows>
 */
export function FormRows({ inCard = false, children }: FormRowsProps) {
  return (
    <FormRowsContext value={inCard ? "card" : "sheet"}>
      <div
        className={inCard ? "flex flex-col gap-3" : "flex flex-col divide-y divide-border *:py-4"}
      >
        {children}
      </div>
    </FormRowsContext>
  );
}
