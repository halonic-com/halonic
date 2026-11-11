/** A workspace the switcher remembers on this device. */
export interface RememberedWorkspace {
  /** Its folder's location, as the folder picker gave it: the one key of a workspace. */
  readonly location: string;
  /** Its name when it was last shown, such as "Acme". */
  readonly name: string;
}

/** Where the list is kept: the page's `localStorage` in the app. */
export interface RecentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The switcher remembers this many workspaces (`workspace.switcher.recent-workspaces`). */
export const RECENT_WORKSPACES = 9;

const storageKey = "halonic.workspace.recent";

/**
 * The workspaces shown last on this device, most recent first, at most {@link RECENT_WORKSPACES}
 * (`workspace.switcher.recent-workspaces`). It is kept in the page's storage, so it survives a
 * restart; a list that can't be read counts as empty, and one that can't be written stays as it
 * was, so Recent never stops the window from opening a workspace.
 *
 * @example
 * const recent = new RecentWorkspaces(window.localStorage);
 * recent.remember({ location: "/work/acme", name: "Acme" });
 * recent.list(); // [{ location: "/work/acme", name: "Acme" }]
 */
export class RecentWorkspaces {
  readonly #storage: RecentStorage;

  constructor(storage: RecentStorage) {
    this.#storage = storage;
  }

  /** The remembered workspaces, most recent first. */
  list(): readonly RememberedWorkspace[] {
    let text: string | null;
    try {
      text = this.#storage.getItem(storageKey);
    } catch {
      return [];
    }
    return text === null ? [] : parseList(text);
  }

  /** Puts a workspace first, dropping the oldest past {@link RECENT_WORKSPACES}. */
  remember(workspace: RememberedWorkspace): void {
    const others = this.list().filter((each) => each.location !== workspace.location);
    this.#write([{ location: workspace.location, name: workspace.name }, ...others]);
  }

  /** Forgets a workspace, as "Remove from Recent" does. */
  forget(location: string): void {
    this.#write(this.list().filter((each) => each.location !== location));
  }

  #write(list: readonly RememberedWorkspace[]): void {
    try {
      this.#storage.setItem(storageKey, JSON.stringify(list.slice(0, RECENT_WORKSPACES)));
    } catch {
      // Full or blocked storage: Recent keeps what it had.
    }
  }
}

/** The stored list, keeping only well-formed entries. */
function parseList(text: string): readonly RememberedWorkspace[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRemembered).slice(0, RECENT_WORKSPACES);
}

function isRemembered(value: unknown): value is RememberedWorkspace {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as { readonly location?: unknown; readonly name?: unknown };
  return typeof entry.location === "string" && typeof entry.name === "string";
}
