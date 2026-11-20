import { type GridCellProps, settleOnClose } from "@halonicjs/studio-kit";
import type { KeyboardEvent } from "react";
import { cellText } from "../collection-format.ts";
import type { CollectionColumn, CollectionNewRow } from "../collection-host.ts";
import { collectionWords } from "../collection-words.ts";
import { CellBody } from "./cell-editor.tsx";
import type { CellMove } from "./grid-focus.ts";
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

/** Whether the key types one character: not a shortcut, not Space (which flips a yes/no) and not mid-composition. */
function isTyping(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return false;
  return event.key.length === 1 && event.key !== " ";
}

/** What a key does on a cell: empties it, opens its editor, opens it with the typed character, or nothing (but the key is still taken). */
function cellKeyAction(
  event: KeyboardEvent,
  field: CollectionColumn,
): "clear" | "open" | "replace" | "none" | undefined {
  if (event.key === "Delete" || event.key === "Backspace") return "clear";
  if (isTyping(event))
    return field.type === "boolean" || field.type === "choice" ? "none" : "replace";
  if (event.key === "Enter" || event.key === "F2") return "open";
  if (event.key === " ") return field.type === "boolean" ? "open" : "none";
  return undefined;
}

/** What one cell of the grid needs. */
interface RecordCellProps {
  readonly row: string;
  /** What the record is called: its first field's text, "New record" in the new row, or nothing. */
  readonly recordName: string | undefined;
  readonly field: CollectionColumn;
  readonly value: unknown;
  readonly typedText: string;
  readonly newRow: CollectionNewRow | undefined;
  readonly edits: RecordEdits;
  /** The message under the cell: the core's refusal of its value, or that its save failed. */
  readonly message: string | undefined;
  readonly messageId: string;
  readonly navigation: GridCellProps;
  readonly focusTarget: (move: CellMove) => HTMLElement | null | undefined;
}

/** One cell of the grid: its text, or its editor, with the message under it. */
export function RecordCell({
  row,
  recordName,
  field,
  value,
  typedText,
  newRow,
  edits,
  message,
  messageId,
  navigation,
  focusTarget,
}: RecordCellProps) {
  const isNew = row === newRowId;
  const { shown, preview } = cellView(isNew, field, value, typedText, newRow);
  const editing = edits.editing?.row === row && edits.editing.field === field.name;
  // The new row's empty cell still says what it is, and has a normal row's height (a11y check L7).
  const blankNew = isNew && !editing && shown === "" && preview === "";

  function keys(event: KeyboardEvent): void {
    if (event.target !== event.currentTarget || field.computed) return;
    const action = cellKeyAction(event, field);
    if (action === undefined) return;
    event.preventDefault();
    if (action === "clear") void edits.clear(row, field);
    else if (action === "open") edits.start(row, field, value);
    else if (action === "replace") edits.start(row, field, value, event.key);
  }

  return (
    // biome-ignore lint/a11y/useFocusableInteractive: its tabIndex comes from navigation.cell(), which Biome can't see
    <td
      // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a cell of the grid
      role="gridcell"
      aria-describedby={message === undefined ? undefined : messageId}
      aria-readonly={field.computed || undefined}
      // The ring is drawn inside: an outer one is covered by the next cells and clipped at the grid's edge.
      className={`h-9 min-w-32 px-3 py-2 align-top focus-ring-inset [overflow-wrap:anywhere] ${field.computed ? "bg-surface-subtle" : ""} ${message === undefined ? "" : "ring-2 ring-inset ring-danger"}`}
      onKeyDown={keys}
      onDoubleClick={() => edits.start(row, field, value)}
      {...navigation}
    >
      <CellBody
        editing={editing}
        field={field}
        label={collectionWords.cellLabel(field.name, recordName)}
        initial={edits.editing?.seed ?? (isNew ? typedText : editText(value))}
        shown={shown}
        preview={preview}
        onCommit={(text) => void settleOnClose(edits.commit(row, field, text))}
        onCancel={edits.stopEditing}
        focusTarget={focusTarget}
      />
      {blankNew ? <span className="sr-only">{collectionWords.newRowLabel}</span> : null}
      {message === undefined ? null : (
        <p id={messageId} role="alert" className="text-small text-danger">
          {message}
        </p>
      )}
    </td>
  );
}
