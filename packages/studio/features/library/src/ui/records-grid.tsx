import { Dialog, useGridNavigation } from "@halonicjs/studio-kit";
import { Fragment, useId, useRef } from "react";
import { headerMarks } from "../collection-format.ts";
import type { CollectionColumn, CollectionGridData, CollectionNewRow } from "../collection-host.ts";
import type { CollectionModel, CollectionState } from "../collection-model.ts";
import { collectionWords } from "../collection-words.ts";
import { RecordCell } from "./record-cell.tsx";
import { RowMenu } from "./row-menu.tsx";
import { newRowId, useRecordEdits } from "./use-record-edits.ts";

interface RecordsGridProps {
  readonly label: string;
  readonly model: CollectionModel;
  readonly state: CollectionState;
  readonly grid: CollectionGridData;
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
  const edits = useRecordEdits(model);
  const wrapper = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const navigation = useGridNavigation([
    ...rows.map((row) => ({ id: row.id, cells: [...fields.map(() => true), true] })),
    { id: newRowId, cells: fields.map(() => true) },
  ]);
  const newRow = model.newRow();
  const { cellError, rowRemoved, typed } = state;
  const cellToFocus = () => wrapper.current?.querySelector<HTMLElement>('td[tabindex="0"]');

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
        restoreFocus={cellToFocus}
      />
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
            {rows.map((row, rowIndex) => (
              <tr key={row.id} className="border-b border-border">
                {fields.map((field, column) =>
                  renderCell(row.id, rowIndex, column, row.values[field.name]),
                )}
                <td className="px-1 py-1 align-top">
                  <RowMenu
                    row={row.id}
                    cell={navigation.cell(row.id, fields.length)}
                    onRemove={() => edits.askRemove(row.id)}
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
          returnFocus={() => cellToFocus() ?? null}
          {...(edits.removeFailed ? { error: collectionWords.removeFailed } : {})}
        >
          {null}
        </Dialog>
      )}
    </div>
  );
}
