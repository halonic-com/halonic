import { Dialog, EmptyState, useGridNavigation } from "@halonicjs/studio-kit";
import { Fragment, type KeyboardEvent, useId, useRef } from "react";
import { headerMarks } from "../collection-format.ts";
import type { CollectionColumn, CollectionGridData, CollectionNewRow } from "../collection-host.ts";
import type { CollectionModel, CollectionState } from "../collection-model.ts";
import { collectionWords } from "../collection-words.ts";
import {
  type CellMove,
  gridRows,
  isGridCell,
  keyTarget,
  neighbour,
  rowCells,
} from "./grid-focus.ts";
import { RecordCell } from "./record-cell.tsx";
import { RowMenu } from "./row-menu.tsx";
import { newRowId, useRecordEdits } from "./use-record-edits.ts";

interface RecordsGridProps {
  readonly label: string;
  readonly model: CollectionModel;
  readonly state: CollectionState;
  readonly grid: CollectionGridData;
}

/** The new row's cells, from the first field. */
function newRowCells(root: HTMLElement | null): HTMLElement[] {
  const rows = root === null ? [] : gridRows(root);
  const row = rows.at(-1);
  return row === undefined ? [] : rowCells(row, false);
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
export function RecordsGrid({ label, model, state, grid }: RecordsGridProps) {
  const { fields, rows } = grid;
  const wrapper = useRef<HTMLDivElement>(null);
  // Where a removed row was, so focus can go to the row that took its place.
  const removedAt = useRef<{ row: string; index: number; column: number } | undefined>(undefined);
  const edits = useRecordEdits(model, {
    onAdded: () => newRowCells(wrapper.current)[0]?.focus(),
  });
  const hintId = useId();
  const navigation = useGridNavigation([
    ...rows.map((row) => ({ id: row.id, cells: [...fields.map(() => true), true] })),
    { id: newRowId, cells: fields.map(() => true) },
  ]);
  const newRow = model.newRow();
  const { cellError, rowRemoved, typed } = state;
  const cellToFocus = () => wrapper.current?.querySelector<HTMLElement>('td[tabindex="0"]');

  /** The cell focus goes to when an editor closes with `move`. */
  function focusTarget(move: CellMove): HTMLElement | null | undefined {
    const from = cellToFocus();
    if (!wrapper.current || !from) return from;
    return move === "stay" ? from : neighbour(wrapper.current, from, move);
  }

  /** Where focus goes once Remove took the row away: its place in the same column, else the row before. */
  function afterRemove(): HTMLElement | null {
    const at = removedAt.current;
    const root = wrapper.current;
    if (!at || !root || model.state.grid?.rows.some((row) => row.id === at.row))
      return cellToFocus() ?? null;
    const all = gridRows(root);
    const row = all[Math.min(at.index, all.length - 2)] ?? all.at(-1);
    const cells = row === undefined ? [] : rowCells(row);
    return cells[Math.min(at.column, cells.length - 1)] ?? null;
  }

  /** Home, End, Ctrl Home, Ctrl End, Page Up and Page Down move between cells; Shift F10 opens a row's menu. */
  function gridKeys(event: KeyboardEvent): void {
    const root = wrapper.current;
    if (!root || !isGridCell(root, event.target) || event.altKey) return;
    const menu = event.key === "F10" ? event.shiftKey : event.key === "ContextMenu";
    if (menu) {
      const button = rowCells(event.target.closest("tr") as HTMLElement).at(-1);
      if (button?.tagName !== "BUTTON") return;
      event.preventDefault();
      // Focused first, so the menu opens as for the keyboard: on its first item.
      button.focus();
      button.click();
      return;
    }
    const target = keyTarget(root, event.target, event.key, event.ctrlKey);
    if (target === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    target.focus();
  }

  /** Add record: the new row's first field opens, ready to type. */
  function addRecord(): void {
    const column = fields.findIndex((field) => !field.computed);
    const field = fields[column];
    newRowCells(wrapper.current)[column]?.focus();
    if (field !== undefined) edits.start(newRowId, field, undefined);
  }

  function message(row: string, field: string): string | undefined {
    if (cellError?.row === row && cellError.field === field) return cellError.message;
    const failed = edits.saveFailed;
    if (failed?.row === row && failed.field === field) return collectionWords.saveFailed;
    return undefined;
  }

  function renderCell(row: string, rowIndex: number, column: number, value: unknown) {
    const field = fields[column] as CollectionColumn;
    return (
      <RecordCell
        key={field.name}
        row={row}
        field={field}
        value={value}
        typedText={typed[field.name] ?? ""}
        newRow={newRow}
        edits={edits}
        message={message(row, field.name)}
        messageId={`${hintId}-${rowIndex}-${column}`}
        navigation={navigation.cell(row, column)}
        focusTarget={focusTarget}
      />
    );
  }

  const hint = newRowHint(newRow);

  return (
    <div ref={wrapper} className="flex min-w-0 flex-col gap-2">
      {rows.length === 0 ? (
        <EmptyState
          plain
          title={
            state.view === null ? collectionWords.noRecords : collectionWords.noneInView(state.view)
          }
          {...(state.view === null
            ? { action: { label: collectionWords.addRecord, onClick: addRecord } }
            : {})}
        />
      ) : null}
      <div className="min-w-0 overflow-x-auto rounded-md border border-border">
        <table
          // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the ARIA grid pattern on a table, as the kit's List does
          role="grid"
          aria-label={label}
          className="w-full border-collapse"
          {...navigation.gridProps}
          onKeyDown={(event) => {
            gridKeys(event);
            if (!event.isPropagationStopped()) navigation.gridProps.onKeyDown(event);
          }}
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
            {rows.map((row, rowIndex) => (
              <tr key={row.id} className="border-b border-border">
                {fields.map((field, column) =>
                  renderCell(row.id, rowIndex, column, row.values[field.name]),
                )}
                <td className="px-1 py-1 align-top">
                  <RowMenu
                    row={row.id}
                    cell={navigation.cell(row.id, fields.length)}
                    onRemove={() => {
                      removedAt.current = {
                        row: row.id,
                        index: rowIndex,
                        column: navigation.active?.column ?? fields.length,
                      };
                      edits.askRemove(row.id);
                    }}
                  />
                </td>
              </tr>
            ))}
            <tr className="bg-surface-subtle/50">
              {fields.map((_, column) => renderCell(newRowId, rows.length, column, undefined))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {hint === undefined ? null : <p className="text-small text-fg-muted">{hint}</p>}
      {edits.addFailed ? (
        <p role="alert" className="text-small text-danger">
          {collectionWords.addFailed}
        </p>
      ) : null}
      {rowRemoved ? (
        <p role="status" className="text-small text-danger">
          {collectionWords.rowRemoved}
        </p>
      ) : null}
      <p role="status" className="sr-only">
        {edits.announcement}
      </p>
      {edits.removing === undefined ? null : (
        <Dialog
          title={collectionWords.removeTitle(edits.removing)}
          size="sm"
          confirm={{
            label: collectionWords.remove,
            variant: "danger",
            busyLabel: collectionWords.removing,
          }}
          busy={edits.removeBusy}
          onConfirm={() => void edits.confirmRemove(edits.removing as string)}
          onCancel={edits.cancelRemove}
          returnFocus={afterRemove}
          {...(edits.removeFailed ? { error: collectionWords.removeFailed } : {})}
        >
          {null}
        </Dialog>
      )}
    </div>
  );
}
