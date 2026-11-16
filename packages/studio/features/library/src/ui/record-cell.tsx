import type { GridCellProps } from "@halonicjs/studio-kit";
import type { KeyboardEvent } from "react";
import { cellText } from "../collection-format.ts";
import type { CollectionColumn, CollectionNewRow } from "../collection-host.ts";
import { collectionWords } from "../collection-words.ts";
import { CellBody } from "./cell-editor.tsx";
import { newRowId, type RecordEdits } from "./use-record-edits.ts";

/** What a cell holds as the text its editor starts with: numbers as plain digits, empty as nothing. */
function editText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/** The new row's yes/no as the value it stands for, so it shows as "yes" or "no". */
function typedValue(field: CollectionColumn, text: string): unknown {
  if (field.type !== "boolean") return text;
  return text === "" ? undefined : text === "true";
}

/** What a cell shows: its text and, in the new row's empty cell, the default it will get. */
function cellView(
  isNew: boolean,
  field: CollectionColumn,
  value: unknown,
  typedText: string,
  newRow: CollectionNewRow | undefined,
): { readonly shown: string; readonly preview: string } {
  if (!isNew) return { shown: cellText(field, value), preview: "" };
  return {
    shown: cellText(field, typedValue(field, typedText)),
    preview: typedText === "" ? (newRow?.draft[field.name] ?? "") : "",
  };
}

/** What one cell of the grid needs. */
interface RecordCellProps {
  readonly row: string;
  readonly field: CollectionColumn;
  readonly value: unknown;
  readonly typedText: string;
  readonly newRow: CollectionNewRow | undefined;
  readonly edits: RecordEdits;
  /** The message under the cell: the core's refusal of its value, or that its save failed. */
  readonly message: string | undefined;
  readonly messageId: string;
  readonly navigation: GridCellProps;
  readonly restoreFocus: () => HTMLElement | null | undefined;
}

/** One cell of the grid: its text, or its editor, with the message under it. */
export function RecordCell({
  row,
  field,
  value,
  typedText,
  newRow,
  edits,
  message,
  messageId,
  navigation,
  restoreFocus,
}: RecordCellProps) {
  const isNew = row === newRowId;
  const { shown, preview } = cellView(isNew, field, value, typedText, newRow);

  function keys(event: KeyboardEvent): void {
    if (event.target !== event.currentTarget || field.computed) return;
    if (event.key !== "Enter" && event.key !== "F2" && event.key !== " ") return;
    event.preventDefault();
    if (event.key !== " " || field.type === "boolean") edits.start(row, field, value);
  }

  return (
    // biome-ignore lint/a11y/useFocusableInteractive: its tabIndex comes from navigation.cell(), which Biome can't see
    <td
      // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a cell of the grid
      role="gridcell"
      aria-describedby={message === undefined ? undefined : messageId}
      aria-readonly={field.computed || undefined}
      className={`min-w-32 px-3 py-2 align-top focus-ring [overflow-wrap:anywhere] ${field.computed ? "bg-surface-subtle" : ""}`}
      onKeyDown={keys}
      onDoubleClick={() => edits.start(row, field, value)}
      {...navigation}
    >
      <CellBody
        editing={edits.editing?.row === row && edits.editing.field === field.name}
        field={field}
        label={`${field.name}, ${isNew ? collectionWords.newRowLabel : row}`}
        initial={isNew ? typedText : editText(value)}
        shown={shown}
        preview={preview}
        onCommit={(text) => void edits.commit(row, field, text)}
        onCancel={edits.stopEditing}
        restoreFocus={restoreFocus}
      />
      {message === undefined ? null : (
        <p id={messageId} role="alert" className="text-small text-danger">
          {message}
        </p>
      )}
    </td>
  );
}
