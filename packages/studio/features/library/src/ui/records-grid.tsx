import { Dialog, useGridNavigation } from "@halonicjs/studio-kit";
import { Fragment, type KeyboardEvent, useId, useRef, useState } from "react";
import { cellText, headerMarks } from "../collection-format.ts";
import type { CollectionColumn, CollectionNewRow, CollectionRow } from "../collection-host.ts";
import type { CollectionModel, CollectionState } from "../collection-model.ts";
import { collectionWords } from "../collection-words.ts";
import { CellBody } from "./cell-editor.tsx";
import { RowMenu } from "./row-menu.tsx";

/** The new row's id in the grid's navigation: no record has it, as a record's id has no `~`. */
const newRowId = "~new";

/** The cell being edited. */
interface Editing {
  readonly row: string;
  readonly field: string;
}

interface RecordsGridProps {
  readonly label: string;
  readonly model: CollectionModel;
  readonly state: CollectionState;
  readonly fields: readonly CollectionColumn[];
  readonly rows: readonly CollectionRow[];
}

/** What a cell holds as the text its editor starts with: numbers as plain digits, empty as nothing. */
function editText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
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
  return { shown: typedText, preview: typedText === "" ? (newRow?.draft[field.name] ?? "") : "" };
}

/** What the line under the grid says about the new row: why it isn't a record yet, if it isn't. */
function newRowHint(newRow: CollectionNewRow | undefined): string | undefined {
  if (newRow === undefined) return undefined;
  if (newRow.message !== undefined) return newRow.message;
  if (newRow.stillNeeded.length === 0) return undefined;
  return collectionWords.newRowHint(newRow.stillNeeded);
}

/**
 * A real `grid`: one Tab stop, arrows move between cells, Enter or a double click opens a cell's
 * editor and leaving it saves (flow-library 5.3, accessibility pass 9.3). The last row is the
 * new record; each row's menu has Remove.
 */
export function RecordsGrid({ label, model, state, fields, rows }: RecordsGridProps) {
  const [editing, setEditing] = useState<Editing | undefined>(undefined);
  const [saveFailed, setSaveFailed] = useState<Editing | undefined>(undefined);
  const [addFailed, setAddFailed] = useState(false);
  const [removing, setRemoving] = useState<string | undefined>(undefined);
  const [removeFailed, setRemoveFailed] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const navigation = useGridNavigation([
    ...rows.map((row) => ({ id: row.id, cells: [...fields.map(() => true), true] })),
    { id: newRowId, cells: fields.map(() => true) },
  ]);
  const newRow = model.newRow();
  const { cellError, rowRemoved, typed } = state;

  function open(row: string, field: string): void {
    model.editing(row, field);
    setSaveFailed(undefined);
    setEditing({ row, field });
  }

  async function commit(row: string, field: CollectionColumn, text: string): Promise<void> {
    setEditing(undefined);
    if (row === newRowId) {
      model.typeNew(field.name, text);
      setAddFailed(false);
      if ((await model.addNew()) === "failed") setAddFailed(true);
      return;
    }
    const saved = await model.saveCell(row, field.name, text);
    if (!saved && model.state.cellError === undefined && !model.state.rowRemoved) {
      setSaveFailed({ row, field: field.name });
    }
  }

  async function remove(row: string): Promise<void> {
    setRemoveFailed(false);
    if (await model.remove(row)) {
      setRemoving(undefined);
    } else {
      setRemoveFailed(true);
    }
  }

  function cellKeys(event: KeyboardEvent, row: string, field: CollectionColumn, value: unknown) {
    if (event.target !== event.currentTarget || field.computed) return;
    if (event.key !== "Enter" && event.key !== "F2" && event.key !== " ") return;
    event.preventDefault();
    if (event.key !== " " || field.type === "boolean") start(row, field, value);
  }

  /** Opens the cell's editor; a yes/no cell has none and flips instead. */
  function start(row: string, field: CollectionColumn, value: unknown): void {
    if (field.computed) return;
    if (field.type === "boolean") void commit(row, field, value === true ? "false" : "true");
    else open(row, field.name);
  }

  function cellClass(field: CollectionColumn): string {
    return `min-w-32 px-3 py-2 align-top focus-ring [overflow-wrap:anywhere] ${field.computed ? "bg-surface-subtle" : ""}`;
  }

  function cellMessage(row: string, field: string): string | undefined {
    if (cellError?.row === row && cellError.field === field) return cellError.message;
    if (saveFailed?.row === row && saveFailed.field === field) return collectionWords.saveFailed;
    return undefined;
  }

  function renderCell(row: string, field: CollectionColumn, column: number, value: unknown) {
    const message = cellMessage(row, field.name);
    const messageId = `${hintId}-${row}-${column}`;
    const isNew = row === newRowId;
    const typedText = typed[field.name] ?? "";
    const { shown, preview } = cellView(isNew, field, value, typedText, newRow);
    return (
      // biome-ignore lint/a11y/useFocusableInteractive: its tabIndex comes from navigation.cell(), which Biome can't see
      <td
        key={field.name}
        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a cell of the grid
        role="gridcell"
        aria-describedby={message === undefined ? undefined : messageId}
        aria-readonly={field.computed || undefined}
        className={cellClass(field)}
        onKeyDown={(event) => cellKeys(event, row, field, value)}
        onDoubleClick={() => start(row, field, value)}
        {...navigation.cell(row, column)}
      >
        <CellBody
          editing={editing?.row === row && editing.field === field.name}
          field={field}
          label={`${field.name}, ${isNew ? collectionWords.newRowLabel : row}`}
          initial={isNew ? typedText : editText(value)}
          shown={shown}
          preview={preview}
          onCommit={(text) => void commit(row, field, text)}
          onCancel={() => setEditing(undefined)}
          restoreFocus={() => wrapper.current?.querySelector<HTMLElement>('td[tabindex="0"]')}
        />
        {message === undefined ? null : (
          <p id={messageId} role="alert" className="text-small text-danger">
            {message}
          </p>
        )}
      </td>
    );
  }

  const hint = newRowHint(newRow);

  return (
    <div ref={wrapper} className="flex min-w-0 flex-col gap-2">
      <div className="min-w-0 overflow-x-auto rounded-md border border-border">
        <table
          // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the ARIA grid pattern on a table, as the kit's List does
          role="grid"
          aria-label={label}
          className="w-full border-collapse"
          {...navigation.gridProps}
        >
          <thead>
            <tr className="border-b border-border bg-surface-subtle text-left text-small font-medium">
              {fields.map((field) => (
                <th key={field.name} scope="col" className="min-w-32 px-3 py-2 font-medium">
                  {field.name}
                  {headerMarks(field).map(({ mark, hint: markHint }) => (
                    <Fragment key={markHint}>
                      {" "}
                      <span aria-hidden="true">{mark}</span>
                      <span className="sr-only">{markHint}</span>
                    </Fragment>
                  ))}
                </th>
              ))}
              <th scope="col" className="w-10 px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border">
                {fields.map((field, column) =>
                  renderCell(row.id, field, column, row.values[field.name]),
                )}
                <td className="px-1 py-1 align-top">
                  <RowMenu
                    row={row.id}
                    cell={navigation.cell(row.id, fields.length)}
                    onRemove={() => {
                      setRemoveFailed(false);
                      setRemoving(row.id);
                    }}
                  />
                </td>
              </tr>
            ))}
            <tr className="bg-surface-subtle/50">
              {fields.map((field, column) => renderCell(newRowId, field, column, undefined))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {hint === undefined ? null : <p className="text-small text-fg-muted">{hint}</p>}
      {addFailed ? (
        <p role="alert" className="text-small text-danger">
          {collectionWords.addFailed}
        </p>
      ) : null}
      {rowRemoved ? (
        <p role="status" className="text-small text-danger">
          {collectionWords.rowRemoved}
        </p>
      ) : null}
      {removing === undefined ? null : (
        <Dialog
          title={collectionWords.removeTitle(removing)}
          size="sm"
          confirm={{
            label: collectionWords.remove,
            variant: "danger",
            busyLabel: collectionWords.removing,
          }}
          onConfirm={() => void remove(removing)}
          onCancel={() => setRemoving(undefined)}
          returnFocus={() =>
            wrapper.current?.querySelector<HTMLElement>('td[tabindex="0"]') ?? null
          }
          {...(removeFailed ? { error: collectionWords.removeFailed } : {})}
        >
          {null}
        </Dialog>
      )}
    </div>
  );
}
