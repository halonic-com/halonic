import type { ItemUsage } from "@halonicjs/app";
import { errorMessageFor } from "@halonicjs/studio-shell";
import type {
  CollectionGridData,
  CollectionHost,
  CollectionNewRow,
  CollectionRef,
  CollectionSource,
} from "./collection-host.ts";
import { collectionWords } from "./collection-words.ts";

/** A value the cell's field doesn't accept: the core message, shown under that cell until its next edit. */
export interface CellError {
  readonly row: string;
  readonly field: string;
  readonly message: string;
}

/** What the collection page shows. */
export interface CollectionState {
  readonly loaded: boolean;
  /** The first read failed and nothing has loaded yet; the next refresh clears it. */
  readonly failed: boolean;
  /** Why the first read failed, in words for the user; absent when the error has none (the page then says the engine isn't answering). */
  readonly failureReason: string | undefined;
  /** The workspace has no such collection (any more). */
  readonly gone: boolean;
  readonly name: string;
  /** The records are kept only while this Studio is open. */
  readonly volatile: boolean;
  /** The chosen chip's view; `null` is All. */
  readonly view: string | null;
  readonly grid?: CollectionGridData;
  readonly usage?: ItemUsage;
  readonly cellError: CellError | undefined;
  /** The new row's typed text by field name. */
  readonly typed: Readonly<Record<string, string>>;
  /** Set when an edit found its row removed by another change; cleared by the next edit. */
  readonly rowRemoved: boolean;
}

/** The sentence a failed read gives the user: a system message never reaches them. */
function reasonOf(error: unknown): string | undefined {
  const message = errorMessageFor(error, { title: collectionWords.couldntLoad("collection") });
  const reason = message.body.trim();
  return message.kind === "internal" || reason === "" ? undefined : reason;
}

/** What adding the new row came to. */
export type AddOutcome = "added" | "needs-more" | "refused" | "failed";

/**
 * One collection's page state: its grid read from the host, a save for each cell edit, the new
 * row's typed text and a refresh whenever the host says records may have changed. The page reads
 * it with `useSyncExternalStore`. A refresh never touches the cell being edited: the page keeps
 * that text itself and the model only replaces the rows around it.
 */
export class CollectionModel {
  state: CollectionState = {
    loaded: false,
    failed: false,
    failureReason: undefined,
    gone: false,
    name: "",
    volatile: false,
    view: null,
    cellError: undefined,
    typed: {},
    rowRemoved: false,
  };
  private source: CollectionSource | undefined;
  private readonly listeners = new Set<() => void>();
  private stopHost: (() => void) | undefined;
  private latest = 0;
  private adding: Promise<AddOutcome> | undefined;

  private readonly host: CollectionHost;
  private readonly collection: CollectionRef;

  constructor(host: CollectionHost, collection: CollectionRef) {
    this.host = host;
    this.collection = collection;
  }

  /** Calls `listener` after each change of `state`; returns the way to stop. The first listener starts watching the host. */
  subscribe(listener: () => void): () => void {
    if (this.listeners.size === 0) {
      this.stopHost = this.host.subscribe(() => void this.refresh());
      void this.refresh();
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stopHost?.();
        this.stopHost = undefined;
      }
    };
  }

  /** Asks the host again. A failed read keeps what was shown. An older answer never replaces a newer one. */
  async refresh(): Promise<void> {
    const ticket = ++this.latest;
    try {
      const [source, usage] = await Promise.all([
        this.host.read(this.collection),
        this.host.usage(this.collection),
      ]);
      if (ticket !== this.latest) return;
      if (source === undefined) {
        this.source = undefined;
        this.set({
          ...this.state,
          loaded: true,
          failed: false,
          failureReason: undefined,
          gone: true,
        });
        return;
      }
      this.source = source;
      const { view, grid } = this.viewOf(source, this.state.view);
      this.set({
        ...this.state,
        loaded: true,
        failed: false,
        failureReason: undefined,
        gone: false,
        name: source.name,
        volatile: source.volatile,
        view,
        grid,
        usage,
      });
    } catch (error) {
      // A page that has loaded keeps what it shows; only a first read that failed says so.
      if (ticket === this.latest && !this.state.loaded) {
        this.set({ ...this.state, failed: true, failureReason: reasonOf(error) });
      }
    }
  }

  /** Shows the records of a view, or all of them for `null`. A view the collection doesn't have shows all. */
  chooseView(view: string | null): void {
    if (this.source === undefined) return;
    this.set({ ...this.state, ...this.viewOf(this.source, view) });
  }

  /** The next edit of a cell: its old error and the removed-row line go away. */
  editing(row: string, field: string): void {
    const { cellError, rowRemoved } = this.state;
    const clears = cellError !== undefined && cellError.row === row && cellError.field === field;
    if (!clears && !rowRemoved) return;
    this.set({ ...this.state, cellError: clears ? undefined : cellError, rowRemoved: false });
  }

  /**
   * Saves what was typed into a cell as one change. A value the field doesn't accept saves
   * nothing and sets {@link CollectionState.cellError}; an unchanged value saves nothing. Resolves
   * to whether the cell now holds the typed value (or already did).
   */
  async saveCell(row: string, field: string, text: string): Promise<boolean> {
    if (this.source === undefined) return false;
    const record = this.state.grid?.rows.find((candidate) => candidate.id === row);
    if (record === undefined) {
      this.set({ ...this.state, rowRemoved: true });
      return false;
    }
    const edit = this.source.editCell(field, text);
    if (!edit.ok) {
      this.set({ ...this.state, cellError: { row, field, message: edit.message } });
      return false;
    }
    const changes = Object.entries(edit.values).some(
      ([name, value]) => (record.values[name] ?? null) !== value,
    );
    if (!changes) return true;
    try {
      const result = await this.host.change(this.collection, row, edit.values);
      if (result === "removed") {
        this.set({ ...this.state, rowRemoved: true });
        await this.refresh();
        return false;
      }
    } catch {
      return false;
    }
    await this.refresh();
    return true;
  }

  /** Remembers the text typed into a cell of the new row. */
  typeNew(field: string, text: string): void {
    this.set({ ...this.state, typed: { ...this.state.typed, [field]: text } });
  }

  /**
   * Adds the new row as a record when every required field is filled and every value is accepted,
   * and empties the row. Resolves to `needs-more` while a required field is empty and `refused`
   * when a value isn't accepted (the new row's message says which), and `failed` when the write failed.
   * A call while an add is still pending returns that add's outcome and adds nothing more. Text
   * typed into the new row during the add stays.
   */
  addNew(): Promise<AddOutcome> {
    this.adding ??= this.add().finally(() => {
      this.adding = undefined;
    });
    return this.adding;
  }

  private async add(): Promise<AddOutcome> {
    if (this.source === undefined) return "failed";
    const sent = this.state.typed;
    const row = this.source.newRow(sent);
    if (row.stillNeeded.length > 0) return "needs-more";
    if (row.record === undefined) return "refused";
    try {
      await this.host.add(this.collection, row.record);
    } catch {
      return "failed";
    }
    const kept = Object.fromEntries(
      Object.entries(this.state.typed).filter(([field, text]) => sent[field] !== text),
    );
    this.set({ ...this.state, typed: kept });
    await this.refresh();
    return "added";
  }

  /** The new row for what is typed so far: its draft, what is still needed and its message. */
  newRow(): CollectionNewRow | undefined {
    return this.source?.newRow(this.state.typed);
  }

  /** Gives the collection a new name. Resolves to whether it was written. */
  async rename(name: string): Promise<boolean> {
    try {
      await this.host.rename(this.collection, name);
    } catch {
      return false;
    }
    await this.refresh();
    return true;
  }

  /** Removes a record. Resolves to whether it was written (a record already gone counts). */
  async remove(row: string): Promise<boolean> {
    try {
      await this.host.remove(this.collection, row);
    } catch {
      return false;
    }
    await this.refresh();
    return true;
  }

  /** The grid of a view; a view the collection doesn't have shows all. */
  private viewOf(
    source: CollectionSource,
    view: string | null,
  ): { view: string | null; grid: CollectionGridData } {
    const grid = source.grid(view);
    if (view === null || grid.views.some((chip) => chip.view === view)) return { view, grid };
    return { view: null, grid: source.grid(null) };
  }

  private set(state: CollectionState): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener();
  }
}
