import { useState } from "react";
import type { CollectionColumn } from "../collection-host.ts";
import type { CollectionModel } from "../collection-model.ts";

/** The new row's id in the grid's navigation: no record has it, as a record's id has no `~`. */
export const newRowId = "~new";

/** The cell being edited, or the one whose save failed. */
export interface CellRef {
  readonly row: string;
  readonly field: string;
}

/** What the grid's cells and Remove dialog read and call. */
export interface RecordEdits {
  readonly editing: CellRef | undefined;
  readonly saveFailed: CellRef | undefined;
  readonly addFailed: boolean;
  readonly removing: string | undefined;
  readonly removeFailed: boolean;
  readonly removeBusy: boolean;
  readonly stopEditing: () => void;
  /** Opens the cell's editor; a yes/no cell has none and flips instead. */
  readonly start: (row: string, field: CollectionColumn, value: unknown) => void;
  readonly commit: (row: string, field: CollectionColumn, text: string) => Promise<void>;
  readonly askRemove: (row: string) => void;
  readonly cancelRemove: () => void;
  readonly confirmRemove: (row: string) => Promise<void>;
}

/** The grid's edit state: which cell is open, what failed, and the Remove dialog's. */
export function useRecordEdits(model: CollectionModel): RecordEdits {
  const [editing, setEditing] = useState<CellRef | undefined>(undefined);
  const [saveFailed, setSaveFailed] = useState<CellRef | undefined>(undefined);
  const [addFailed, setAddFailed] = useState(false);
  const [removing, setRemoving] = useState<string | undefined>(undefined);
  const [removeFailed, setRemoveFailed] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);

  async function commit(row: string, field: CollectionColumn, text: string): Promise<void> {
    setEditing(undefined);
    if (row === newRowId) {
      model.typeNew(field.name, text);
      setAddFailed(false);
      if ((await model.addNew()) === "failed") setAddFailed(true);
      return;
    }
    setSaveFailed(undefined);
    model.editing(row, field.name);
    const saved = await model.saveCell(row, field.name, text);
    const { cellError, rowRemoved } = model.state;
    const refused = cellError?.row === row && cellError.field === field.name;
    if (!saved && !refused && !rowRemoved) setSaveFailed({ row, field: field.name });
  }

  function start(row: string, field: CollectionColumn, value: unknown): void {
    if (field.computed) return;
    if (field.type === "boolean") {
      // A new row's yes/no is the text typed so far; a record's is its value.
      const on = row === newRowId ? model.state.typed[field.name] === "true" : value === true;
      void commit(row, field, on ? "false" : "true");
      return;
    }
    model.editing(row, field.name);
    setSaveFailed(undefined);
    setEditing({ row, field: field.name });
  }

  async function confirmRemove(row: string): Promise<void> {
    if (removeBusy) return;
    setRemoveBusy(true);
    setRemoveFailed(false);
    const removed = await model.remove(row);
    setRemoveBusy(false);
    if (removed) setRemoving(undefined);
    else setRemoveFailed(true);
  }

  return {
    editing,
    saveFailed,
    addFailed,
    removing,
    removeFailed,
    removeBusy,
    stopEditing: () => setEditing(undefined),
    start,
    commit,
    askRemove: (row) => {
      setRemoveFailed(false);
      setRemoving(row);
    },
    cancelRemove: () => setRemoving(undefined),
    confirmRemove,
  };
}
