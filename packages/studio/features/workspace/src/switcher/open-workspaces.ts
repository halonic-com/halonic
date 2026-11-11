/** A workspace open in the window: its folder's location and what the app keeps for it. */
export interface OpenSlot<T> {
  /** Its folder's location, as the folder picker gave it: the one key of a workspace. */
  readonly location: string;
  readonly value: T;
}

/**
 * The workspaces open in one window, in the order they were opened, and which one is shown
 * (`workspace.switcher.open-beside`, `.close-keeps-a-slot`). With none open the window shows its
 * "No workspace" slot, the Welcome screen. Each slot keeps its own value, so a workspace keeps its
 * tabs and services while another is shown (`workspace.switcher.keeps-own-state`).
 *
 * @example
 * const open = new OpenWorkspaces<StudioWorkspace>();
 * open.add("/work/acme", acme);
 * open.shown?.location; // "/work/acme"
 */
export class OpenWorkspaces<T> {
  #slots: readonly OpenSlot<T>[] = [];
  #shown: string | undefined;
  readonly #listeners = new Set<() => void>();

  /** The open workspaces, in the order they were opened. */
  get all(): readonly OpenSlot<T>[] {
    return this.#slots;
  }

  /** The workspace the window shows, or `undefined` for the "No workspace" slot. */
  get shown(): OpenSlot<T> | undefined {
    return this.#slots.find((slot) => slot.location === this.#shown);
  }

  /** The open workspace in that folder, if any. */
  find(location: string): OpenSlot<T> | undefined {
    return this.#slots.find((slot) => slot.location === location);
  }

  /** Adds a workspace beside the open ones and shows it. Open its folder only if {@link find} has none. */
  add(location: string, value: T): void {
    if (this.find(location) !== undefined) {
      throw new Error(`The workspace in ${location} is already open; show it instead.`);
    }
    this.#slots = [...this.#slots, { location, value }];
    this.#show(location);
  }

  /** Shows an open workspace. */
  show(location: string): void {
    if (this.find(location) === undefined) {
      throw new Error(`No workspace is open in ${location}.`);
    }
    this.#show(location);
  }

  /**
   * Shows the open workspace at a position counted from 1, as Ctrl 1 to Ctrl 9 do
   * (`workspace.switcher.ctrl-number-keys`). Returns whether there was one.
   */
  showAt(position: number): boolean {
    const slot = this.#slots[position - 1];
    if (slot === undefined) {
      return false;
    }
    this.#show(slot.location);
    return true;
  }

  /**
   * Takes a workspace out of the window and returns it, for the app to dispose of. If it was
   * shown, the window shows the one at its position, else the last, else "No workspace"
   * (`workspace.switcher.close-keeps-a-slot`).
   */
  close(location: string): OpenSlot<T> | undefined {
    const index = this.#slots.findIndex((slot) => slot.location === location);
    const closed = this.#slots[index];
    if (closed === undefined) {
      return undefined;
    }
    this.#slots = this.#slots.filter((slot) => slot !== closed);
    if (this.#shown === location) {
      this.#shown = (this.#slots[index] ?? this.#slots.at(-1))?.location;
    }
    this.#changed();
    return closed;
  }

  /** Calls `listener` after every change; returns the way to stop. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #show(location: string): void {
    this.#shown = location;
    this.#changed();
  }

  #changed(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
