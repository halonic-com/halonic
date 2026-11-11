import {
  BrowserFolderDefinitionStore,
  type BrowserFolderStoreOptions,
} from "./definition-store.ts";
import { accessFailure, isDomError } from "./folder-access.ts";
import type { FolderPicker } from "./handles.ts";

/**
 * What {@link openLocalFolder} did. `cancelled` means the person closed the
 * picker: nothing is open, and there is nothing to tell them.
 * `not-supported` means the browser can't open a folder at all (Firefox and
 * Safari have no `showDirectoryPicker`), so the Studio offers something else.
 */
export type OpenFolderResult =
  | { readonly status: "opened"; readonly store: BrowserFolderDefinitionStore }
  | { readonly status: "cancelled" }
  | { readonly status: "not-supported" };

/** How {@link openLocalFolder} opens a folder; tests change it. */
export interface OpenFolderOptions extends BrowserFolderStoreOptions {
  /** The folder picker; the browser's `showDirectoryPicker`, or `null` when it has none. */
  readonly picker?: FolderPicker | null;
}

/**
 * The browser's folder picker, or `null` when it has none.
 *
 * @param scope - where to look for it; the page's global scope by default
 */
export function browserFolderPicker(scope: object = globalThis): FolderPicker | null {
  const picker = (scope as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  return typeof picker === "function" ? (picker.bind(scope) as FolderPicker) : null;
}

/**
 * Shows the browser's folder picker and opens the folder the person picks,
 * with read and write access, as a store. The browser shows the picker only
 * from a click or a key press, so call this from one.
 *
 * @throws FolderAccessError when the browser refuses to show the picker or the folder
 */
export async function openLocalFolder(options: OpenFolderOptions = {}): Promise<OpenFolderResult> {
  const { picker = browserFolderPicker(), ...storeOptions } = options;
  if (picker === null) {
    return { status: "not-supported" };
  }
  try {
    const folder = await picker({ mode: "readwrite" });
    return { status: "opened", store: new BrowserFolderDefinitionStore(folder, storeOptions) };
  } catch (error) {
    if (isDomError(error, "AbortError")) {
      return { status: "cancelled" };
    }
    throw accessFailure(error);
  }
}
