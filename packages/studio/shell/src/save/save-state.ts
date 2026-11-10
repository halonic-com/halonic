import type { ToastStore } from "@halonicjs/studio-kit";
import { type SaveFailure, type SaveReason, saveFailureFor } from "./save-failure.ts";

/** Something that saves to the workspace folder: an agent, a workflow, a file. */
export interface SavingItem {
  /** The same key as its tab, such as `agent/acme/sorter`. */
  readonly key: string;
  /** The name a person reads, such as "Support reply". */
  readonly title: string;
}

/**
 * What the toolbar says about saving (save model 1.4), the most urgent first when several are
 * true: saves that failed, then items held back by a change from outside Halonic, then fields
 * with a mistake, then a save running. Otherwise everything is saved. `first` is the item the note
 * names when its count is 1; of items held back, it is the one held longest (Compare opens it).
 */
export type SaveNote =
  | { readonly kind: "failed"; readonly count: number; readonly first: SavingItem }
  | { readonly kind: "items-not-saved"; readonly count: number; readonly first: SavingItem }
  | { readonly kind: "fields-not-saved"; readonly count: number }
  | { readonly kind: "saving" }
  | { readonly kind: "saved" };

/** A write the user can try again, and the toast that told them it failed. */
interface FailedWrite {
  readonly retry: () => void;
  readonly toastId: string;
}

/** What the save state knows about one item. */
interface ItemRecord {
  item: SavingItem;
  /** Writes started and not yet finished. */
  writing: number;
  /** How many writes were ever started; the newest is the only one whose failure counts. */
  attempts: number;
  failed?: FailedWrite | undefined;
  /** Fields of this item that aren't saved because of a mistake. */
  fieldsNotSaved: number;
}

/** What follows "Couldn't save *Support reply*:" for each reason (microcopy 22 F9). */
const reasonWords: Readonly<Record<Exclude<SaveReason, "failed">, string>> = {
  "disk-full": "the disk is full",
  "not-writable": "Halonic can't write to this folder",
  "in-use": "another app is using the file",
};

/**
 * The error toast's title: "Couldn't save *Support reply*: the disk is full." A reason with no
 * words of its own ends after the name; the error's code and message never go on screen.
 */
export function couldNotSaveText(title: string, reason: SaveReason): string {
  return reason === "failed"
    ? `Couldn't save ${title}.`
    : `Couldn't save ${title}: ${reasonWords[reason]}.`;
}

/**
 * Whether a workspace's changes are saved, for the toolbar's save note. The Studio saves by
 * itself (save model 1), so this is the only place saving shows. Screens write through `save`,
 * report fields with a mistake and items a change from outside holds back; the note reads `note`
 * and subscribes. A failed write also shows its error toast, with **Try again**.
 *
 * @example
 * const saving = new SaveState(toasts);
 * await saving.save({ key: "workflow/support-reply", title: "Support reply" }, () => write(file));
 * saving.note; // { kind: "saved" }
 */
export class SaveState {
  private readonly items = new Map<string, ItemRecord>();
  /** Opens Compare for each item a change from outside holds back, longest held first. */
  private readonly held = new Map<string, () => void>();
  private readonly listeners = new Set<() => void>();
  private current: SaveNote = { kind: "saved" };

  private readonly toasts: ToastStore;

  /** `toasts` is the window's toast store, for the failed-save toast. */
  constructor(toasts: ToastStore) {
    this.toasts = toasts;
  }

  /** What the toolbar says now. Every change makes a new note. */
  get note(): SaveNote {
    return this.current;
  }

  /** Calls `listener` after every change of the note. Returns a function that stops it. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Runs `write` for `item`, showing "Saving…" while it runs. A new save of an item clears its
   * last failure and that failure's toast. If `write` fails, the note says "Couldn't save" and an
   * error toast names the item and the reason; **Try again** runs the same write again. When
   * writes of one item overlap, only the newest one's failure counts: an older write holds older
   * content, so trying it again would overwrite the newer save. Resolves to whether the item was
   * saved, and never rejects.
   */
  async save(item: SavingItem, write: () => Promise<void>): Promise<boolean> {
    const record = this.recordFor(item);
    this.clearFailure(record);
    record.attempts += 1;
    const attempt = record.attempts;
    record.writing += 1;
    this.update();
    try {
      await write();
      return true;
    } catch (error) {
      const isNewest = attempt === record.attempts;
      const isKnown = this.items.get(record.item.key) === record;
      if (isNewest && isKnown) {
        this.fail(record, saveFailureFor(error), () => void this.save(record.item, write));
      }
      return false;
    } finally {
      record.writing -= 1;
      this.update();
    }
  }

  /**
   * Says how many fields of `item` aren't saved because of a mistake; 0 when they're all fixed.
   * Each such field keeps its own error line; the note counts them all ("2 fields not saved").
   * A count that isn't a whole number from 0 throws a `RangeError`, as it would break the total.
   */
  setFieldsNotSaved(item: SavingItem, count: number): void {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError(
        `A count of fields not saved must be a whole number from 0, not ${count}.`,
      );
    }
    const record = this.recordFor(item);
    record.fieldsNotSaved = count;
    this.update();
  }

  /**
   * Holds `item` back: it changed outside Halonic while it had changes of the user's (save model
   * 6.3), so its saving pauses until they compare. `compare` opens its Compare. Holding an item
   * again keeps its place in the queue and uses the newest `compare`.
   */
  holdForOutsideChange(item: SavingItem, compare: () => void): void {
    this.recordFor(item);
    // `Map.set` on a key it has keeps the key's place, so "held longest first" still holds.
    this.held.set(item.key, compare);
    this.update();
  }

  /** The user chose in Compare: `key` saves as usual again. */
  releaseHold(key: string): void {
    if (this.held.delete(key)) {
      this.update();
    }
  }

  /**
   * Forgets `key`: the item was deleted, or its tab closed, so nothing will save it again. Its
   * failure toast closes, and it no longer counts in the note: not as failed, held back, saving or
   * with fields not saved. A write of it still running finishes, but its failure no longer counts.
   */
  forget(key: string): void {
    const record = this.items.get(key);
    if (record === undefined) {
      return;
    }
    this.clearFailure(record);
    this.items.delete(key);
    this.held.delete(key);
    this.update();
  }

  /** The note's **Try again**: runs every failed write again. */
  tryAgain(): void {
    for (const record of [...this.items.values()]) {
      record.failed?.retry();
    }
  }

  /** The note's **Compare**: opens Compare for the item held back longest. */
  compare(): void {
    const [first] = this.held.values();
    first?.();
  }

  private fail(record: ItemRecord, failure: SaveFailure, retry: () => void): void {
    const toastId = this.toasts.show({
      tone: "danger",
      title: couldNotSaveText(record.item.title, failure.reason),
      action: { label: "Try again", onClick: retry },
    });
    record.failed = { retry, toastId };
  }

  private clearFailure(record: ItemRecord): void {
    if (record.failed !== undefined) {
      this.toasts.close(record.failed.toastId);
      record.failed = undefined;
    }
  }

  private recordFor(item: SavingItem): ItemRecord {
    const known = this.items.get(item.key);
    if (known !== undefined) {
      // A renamed item keeps its key; its toasts and Compare use the new name from now on.
      known.item = item;
      return known;
    }
    const record: ItemRecord = { item, writing: 0, attempts: 0, fieldsNotSaved: 0 };
    this.items.set(item.key, record);
    return record;
  }

  private update(): void {
    const next = this.noteNow();
    if (sameNote(next, this.current)) {
      return;
    }
    this.current = next;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private noteNow(): SaveNote {
    const records = [...this.items.values()];
    const failed = records.filter((record) => record.failed !== undefined);
    const [firstFailed] = failed;
    if (firstFailed !== undefined) {
      return { kind: "failed", count: failed.length, first: firstFailed.item };
    }
    const [firstHeld] = this.held.keys();
    const first = firstHeld === undefined ? undefined : this.items.get(firstHeld)?.item;
    if (first !== undefined) {
      return { kind: "items-not-saved", count: this.held.size, first };
    }
    const fields = records.reduce((sum, record) => sum + record.fieldsNotSaved, 0);
    if (fields > 0) {
      return { kind: "fields-not-saved", count: fields };
    }
    if (records.some((record) => record.writing > 0)) {
      return { kind: "saving" };
    }
    return { kind: "saved" };
  }
}

/** Whether two notes say the same, so listeners hear only real changes. */
function sameNote(a: SaveNote, b: SaveNote): boolean {
  if (
    (a.kind === "failed" && b.kind === "failed") ||
    (a.kind === "items-not-saved" && b.kind === "items-not-saved")
  ) {
    return a.count === b.count && a.first.key === b.first.key && a.first.title === b.first.title;
  }
  if (a.kind === "fields-not-saved" && b.kind === "fields-not-saved") {
    return a.count === b.count;
  }
  return a.kind === b.kind;
}
