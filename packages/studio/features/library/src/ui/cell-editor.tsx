import { Input, Select } from "@halonicjs/studio-kit";
import { useEffect, useRef } from "react";
import type { CollectionColumn } from "../collection-host.ts";
import { collectionWords } from "../collection-words.ts";

/** What the editor of one cell needs. */
interface CellEditorProps {
  readonly field: CollectionColumn;
  readonly label: string;
  readonly initial: string;
  readonly onCommit: (text: string) => void;
  readonly onCancel: () => void;
  readonly restoreFocus: () => HTMLElement | null | undefined;
}

/**
 * The editor of one cell: a list for a choice, a text box for the rest. Enter or leaving the cell
 * saves; Escape drops what was typed. After Enter or Escape focus goes back to the cell.
 */
export function CellEditor({
  field,
  label,
  initial,
  onCommit,
  onCancel,
  restoreFocus,
}: CellEditorProps) {
  const done = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLElement>(null);

  // The editor opens with focus in it, once.
  useEffect(() => (input.current ?? list.current)?.focus(), []);

  function finish(text: string | undefined, focusCell: boolean): void {
    if (done.current) return;
    done.current = true;
    if (text === undefined) onCancel();
    else onCommit(text);
    if (focusCell) queueMicrotask(() => restoreFocus()?.focus());
  }

  if (field.type === "choice") {
    return (
      <Select
        aria-label={label}
        size="sm"
        value={initial}
        options={[
          ...(field.required ? [] : [{ value: "", label: "" }]),
          ...field.choices.map((choice) => ({ value: choice, label: choice })),
        ]}
        onChange={(value) => finish(value, true)}
        ref={list}
      />
    );
  }
  return (
    <Input
      aria-label={label}
      size="sm"
      defaultValue={initial}
      inputMode={field.type === "number" || field.type === "money" ? "decimal" : "text"}
      ref={input}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(event.currentTarget.value, true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(undefined, true);
        }
      }}
      onBlur={(event) => finish(event.currentTarget.value, false)}
    />
  );
}

/** What a cell holds: its text and, for a new row's empty cell, the default it will get; or its editor. */
export function CellBody({
  editing,
  shown,
  preview,
  ...editor
}: CellEditorProps & {
  readonly editing: boolean;
  readonly shown: string;
  readonly preview: string;
}) {
  if (editing) return <CellEditor {...editor} />;
  return (
    <>
      {shown}
      {preview === "" ? null : (
        <>
          {preview}{" "}
          <span className="rounded-sm bg-surface-subtle px-1 text-small text-fg-muted">
            {collectionWords.defaultTag}
          </span>
        </>
      )}
    </>
  );
}
