import type { ItemUsage, LibraryItemKind } from "@halonicjs/app";
import type { ToastStore } from "@halonicjs/studio-kit";
import { errorMessageFor } from "@halonicjs/studio-shell";
import { deleteWords } from "./delete-words.ts";
import type {
  LibraryItemPlace,
  LibraryItemsHost,
  RemovedLibraryItem,
} from "./library-items-host.ts";
import { usedByLine } from "./used-by-text.ts";

/** The sentence a failure gives the user: a system message never reaches them. */
function reasonOf(error: unknown, title: string): string | undefined {
  const message = errorMessageFor(error, { title });
  const reason = message.body.trim();
  return message.kind === "internal" || reason === "" ? undefined : reason;
}

/** Brings an item back and says so, or says why it couldn't. Resolves to whether it came back. */
export async function putBack(
  removed: RemovedLibraryItem,
  name: string,
  toasts: ToastStore | null,
): Promise<boolean> {
  try {
    await removed.undo();
    toasts?.show({ tone: "success", title: deleteWords.restored(name) });
    return true;
  } catch (error) {
    const title = deleteWords.couldntUndo(name);
    const reason = reasonOf(error, title);
    toasts?.show({ tone: "danger", title, ...(reason === undefined ? {} : { text: reason }) });
    return false;
  }
}

/** What {@link removeItem} needs to know about the item. */
export interface RemoveRequest {
  readonly kind: LibraryItemKind;
  readonly place: LibraryItemPlace;
  readonly name: string;
  readonly usage: ItemUsage;
}

/**
 * Moves an item to the trash with no dialog. A row's delete says it with a toast that has Undo
 * (and, when the item is used, a second line); a page that is open says it itself and passes
 * `quiet`, and gets the way back.
 *
 * @returns the way to put it back, or `undefined` when it couldn't be moved (a toast says why)
 */
export async function removeItem(
  host: LibraryItemsHost,
  toasts: ToastStore | null,
  request: RemoveRequest,
  options: { readonly quiet?: boolean } = {},
): Promise<RemovedLibraryItem | undefined> {
  const { kind, place, name, usage } = request;
  try {
    const removed = await host.remove(kind, place);
    if (options.quiet !== true) {
      const line = usedByLine(usage);
      toasts?.show({
        tone: "success",
        title: deleteWords.moved(name),
        ...(line === undefined ? {} : { text: line }),
        action: { label: deleteWords.undo, onClick: () => void putBack(removed, name, toasts) },
      });
    }
    return removed;
  } catch (error) {
    const title = deleteWords.couldntDelete(name);
    const reason = reasonOf(error, title);
    toasts?.show({ tone: "danger", title, ...(reason === undefined ? {} : { text: reason }) });
    return undefined;
  }
}
