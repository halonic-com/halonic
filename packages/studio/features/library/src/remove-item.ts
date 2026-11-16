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

/**
 * Brings an item back, or says why it couldn't. Success says nothing: the restored row or page is
 * the feedback. Resolves to whether it came back.
 */
export async function putBack(
  removed: RemovedLibraryItem,
  name: string,
  toasts: ToastStore | null,
): Promise<boolean> {
  try {
    await removed.undo();
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

/** What {@link removeItem} can do besides moving the item. */
export interface RemoveOptions {
  /** A page that is open says the move itself, so no toast says it. */
  readonly quiet?: boolean;
  /** Called with the way back once the item is in the trash, also after a Try again. */
  readonly onRemoved?: (removed: RemovedLibraryItem) => void;
}

/**
 * Moves an item to the trash with no dialog. A row's delete says it with a toast that has Undo
 * (and, when agents use the item, a second line); a page that is open says it itself and passes
 * `quiet`. When it can't be moved, a toast that stays says why and offers Try again.
 *
 * @returns the way to put it back, or `undefined` when it couldn't be moved
 */
export async function removeItem(
  host: LibraryItemsHost,
  toasts: ToastStore | null,
  request: RemoveRequest,
  options: RemoveOptions = {},
): Promise<RemovedLibraryItem | undefined> {
  const { kind, place, name, usage } = request;
  try {
    const removed = await host.remove(kind, place);
    options.onRemoved?.(removed);
    if (options.quiet !== true) {
      const line = usedByLine(usage);
      toasts?.show({
        tone: "success",
        title: deleteWords.moved(name, line !== undefined),
        ...(line === undefined ? {} : { text: line }),
        action: { label: deleteWords.undo, onClick: () => void putBack(removed, name, toasts) },
      });
    }
    return removed;
  } catch (error) {
    const title = deleteWords.couldntMove(name, reasonOf(error, name));
    toasts?.show({
      tone: "danger",
      title,
      sticky: true,
      action: {
        label: deleteWords.tryAgain,
        onClick: () => void removeItem(host, toasts, request, options),
      },
    });
    return undefined;
  }
}
