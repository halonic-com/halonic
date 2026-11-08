/** How many steps the workspace keeps, as in the old `Studio` class. */
export const undoLimit = 200;

/**
 * Undo and redo over snapshots of some state. It holds snapshots only; the
 * owner applies them. Workspace-wide: the raw file editor and the structured
 * editors share one history.
 *
 * @example
 * const history = new UndoHistory<string>();
 * history.record("a"); // before changing "a" into "b"
 * history.undo("b"); // "a"
 * history.redo("a"); // "b"
 */
export class UndoHistory<Snapshot> {
  private readonly undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private lastKey: string | null = null;
  private readonly limit: number;

  /**
   * @param limit - the most steps kept; the oldest is dropped beyond it
   */
  constructor(limit = undoLimit) {
    this.limit = limit;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Records the state from before a change, and forgets what could be redone.
   *
   * @param before - the state before the change
   * @param coalesceKey - changes in a row with the same key make one step,
   *   such as typing in one file; `null` always makes a new step
   */
  record(before: Snapshot, coalesceKey: string | null = null): void {
    const sameStep = coalesceKey !== null && coalesceKey === this.lastKey;
    this.lastKey = coalesceKey;
    if (sameStep) {
      return;
    }
    this.undoStack.push(before);
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /**
   * Steps back.
   *
   * @param current - the state now, kept for redo
   * @returns the state to go back to, or `undefined` when there is nothing to undo
   */
  undo(current: Snapshot): Snapshot | undefined {
    const previous = this.undoStack.pop();
    if (previous !== undefined) {
      this.redoStack.push(current);
    }
    this.lastKey = null;
    return previous;
  }

  /**
   * Steps forward again.
   *
   * @param current - the state now, kept for undo
   * @returns the state to go to, or `undefined` when there is nothing to redo
   */
  redo(current: Snapshot): Snapshot | undefined {
    const next = this.redoStack.pop();
    if (next !== undefined) {
      this.undoStack.push(current);
    }
    this.lastKey = null;
    return next;
  }

  /**
   * Rewrites every kept step, undo and redo alike, such as when what a
   * snapshot is measured against has changed.
   */
  map(rewrite: (snapshot: Snapshot) => Snapshot): void {
    this.undoStack.splice(0, this.undoStack.length, ...this.undoStack.map(rewrite));
    this.redoStack = this.redoStack.map(rewrite);
  }

  /** Ends a run of coalesced changes, so the next change is a step of its own. */
  breakStep(): void {
    this.lastKey = null;
  }

  /** Forgets every step, such as when the workspace is read again from disk. */
  clear(): void {
    this.undoStack.length = 0;
    this.redoStack = [];
    this.lastKey = null;
  }
}
