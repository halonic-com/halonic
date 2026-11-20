import { useState } from "react";
import { recordName } from "../collection-format.ts";
import type { CollectionColumn } from "../collection-host.ts";
import type { CollectionModel } from "../collection-model.ts";
import { collectionWords } from "../collection-words.ts";

/** The new row's id in the grid's navigation: no record has it, as a record's id has no `~`. */
export const newRowId = "~new";

/** The cell being edited, or the one whose save failed. */
export interface CellRef {
  readonly row: string;
  readonly field: string;
}

/** The cell being edited and the text its editor opens with, when a typed character replaced the value. */
export interface OpenCell extends CellRef {
  readonly seed?: string;
}

/** The record the Remove dialog asks about, named when it opened, as the name goes with the row. */
export interface RecordToRemove {
  readonly id: string;
  readonly name: string | undefined;
}

/** What the grid's cells and Remove dialog read and call. */
export interface RecordEdits {
  readonly editing: OpenCell | undefined;
  readonly saveFailed: CellRef | undefined;
  readonly addFailed: boolean;
  readonly removing: RecordToRemove | undefined;
  readonly removeFailed: boolean;
  readonly removeBusy: boolean;
  /** What a screen reader hears after a record was added or removed. */
  readonly announcement: string;
  readonly stopEditing: () => void;
  /**
   * Opens the cell's editor; a yes/no cell has none and flips instead. With `seed` the editor
   * starts with that text instead of the value.
   */
  readonly start: (row: string, field: CollectionColumn, value: unknown, seed?: string) => void;
  /** Empties the cell; in the new row, only what was typed there. */
  readonly clear: (row: string, field: CollectionColumn) => Promise<void>;
  readonly commit: (row: string, field: CollectionColumn, text: string) => Promise<void>;
  readonly askRemove: (row: string) => void;
  readonly cancelRemove: () => void;
  readonly confirmRemove: (record: RecordToRemove) => Promise<void>;
}

/** What the grid does after the edits it can't see: where focus goes once a record is added. */
export interface RecordEditsOptions {
  readonly onAdded: () => void;
}

/** The ids of the current rows. */
function rowIds(model: CollectionModel): string[] {
  return model.state.grid?.rows.map((row) => row.id) ?? [];
}

/** The name of the record with this id in the grid as it is now; `undefined` when it has none. */
export function nameOfRecord(model: CollectionModel, id: string | undefined): string | undefined {
  const grid = model.state.grid;
  if (grid === undefined || id === undefined) return undefined;
  return recordName(
    grid.fields,
    grid.rows.find((row) => row.id === id),
  );
}

/** The grid's edit state: which cell is open, what failed, and the Remove dialog's. */
export function useRecordEdits(
  model: CollectionModel,
  { onAdded }: RecordEditsOptions,
): RecordEdits {
  const [editing, setEditing] = useState<OpenCell | undefined>(undefined);
  const [announcement, setAnnouncement] = useState("");
  const [saveFailed, setSaveFailed] = useState<CellRef | undefined>(undefined);
  const [addFailed, setAddFailed] = useState(false);
  const [removing, setRemoving] = useState<RecordToRemove | undefined>(undefined);
  const [removeFailed, setRemoveFailed] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);

  /** Keeps what was typed in the new row and adds the record when that completes it. */
  async function addFrom(field: CollectionColumn, text: string): Promise<void> {
    model.typeNew(field.name, text);
    setAddFailed(false);
    const before = rowIds(model);
    const outcome = await model.addNew();
    if (outcome === "failed") setAddFailed(true);
    if (outcome !== "added") return;
    const added = rowIds(model).find((id) => !before.includes(id));
    setAnnouncement(collectionWords.added(nameOfRecord(model, added)));
    onAdded();
  }

  async function commit(row: string, field: CollectionColumn, text: string): Promise<void> {
    setEditing(undefined);
    if (row === newRowId) return addFrom(field, text);
    setAnnouncement("");
    setSaveFailed(undefined);
    model.editing(row, field.name);
    const saved = await model.saveCell(row, field.name, text);
    const { cellError, rowRemoved } = model.state;
    const refused = cellError?.row === row && cellError.field === field.name;
    if (!saved && !refused && !rowRemoved) setSaveFailed({ row, field: field.name });
  }

  function start(row: string, field: CollectionColumn, value: unknown, seed?: string): void {
    if (field.computed) return;
    if (field.type === "boolean") {
      // A new row's yes/no is the text typed so far; a record's is its value.
      const on = row === newRowId ? model.state.typed[field.name] === "true" : value === true;
      void commit(row, field, on ? "false" : "true");
      return;
    }
    model.editing(row, field.name);
    setSaveFailed(undefined);
    setEditing(seed === undefined ? { row, field: field.name } : { row, field: field.name, seed });
  }

  async function clear(row: string, field: CollectionColumn): Promise<void> {
    if (field.computed) return;
    if (row === newRowId) {
      model.typeNew(field.name, "");
      return;
    }
    await commit(row, field, "");
  }

  async function confirmRemove({ id, name }: RecordToRemove): Promise<void> {
    if (removeBusy) return;
    setRemoveBusy(true);
    setRemoveFailed(false);
    const removed = await model.remove(id);
    setRemoveBusy(false);
    if (removed) {
      setAnnouncement(collectionWords.removed(name));
      setRemoving(undefined);
    } else setRemoveFailed(true);
  }

  return {
    editing,
    saveFailed,
    addFailed,
    removing,
    removeFailed,
    removeBusy,
    announcement,
    stopEditing: () => setEditing(undefined),
    start,
    clear,
    commit,
    askRemove: (row) => {
      setRemoveFailed(false);
      setRemoving({ id: row, name: nameOfRecord(model, row) });
    },
    cancelRemove: () => setRemoving(undefined),
    confirmRemove,
  };
}
