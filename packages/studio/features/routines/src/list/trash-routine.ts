import type { ToastStore } from "@halonicjs/studio-kit";
import { errorMessageFor } from "@halonicjs/studio-shell";
import type { RoutineListing, RoutinesHost, TrashedRoutine } from "../api.ts";
import { deleteWords } from "./list-words.ts";

/** The sentence a failure gives the person: a system message never reaches them. */
function reasonOf(error: unknown, title: string): string | undefined {
  const message = errorMessageFor(error, { title });
  const reason = message.body.trim();
  return message.kind === "internal" || reason === "" ? undefined : reason;
}

/** What {@link trashRoutine} can tell its caller. */
export interface TrashOptions {
  /** Called with the way back once the routine is in the trash, also after a Try again. */
  readonly onTrashed?: () => void;
  /** Called once the toast's Undo has put the routine back. */
  readonly onRestored?: () => void;
}

/**
 * Moves a routine to the trash with no dialog and says so with a toast that has Undo and a second
 * line about what it stops (flow-routines 2.4). When it can't be moved, a toast that stays says why
 * and offers Try again. Undo that can't put it back says why, too.
 */
export async function trashRoutine(
  host: RoutinesHost,
  toasts: ToastStore | null,
  listing: RoutineListing,
  options: TrashOptions = {},
): Promise<void> {
  const { name } = listing;
  let trashed: TrashedRoutine;
  try {
    trashed = await host.trash(listing);
  } catch (error) {
    toasts?.show({
      tone: "danger",
      title: deleteWords.couldntMove(name, reasonOf(error, name)),
      sticky: true,
      action: {
        label: deleteWords.tryAgain,
        onClick: () => void trashRoutine(host, toasts, listing, options),
      },
    });
    return;
  }
  options.onTrashed?.();
  toasts?.show({
    tone: "success",
    title: deleteWords.moved(name),
    text: deleteWords.movedLine(listing.targetName),
    action: {
      label: deleteWords.undo,
      onClick: () => void putBack(trashed, name, toasts, options),
    },
  });
}

async function putBack(
  trashed: TrashedRoutine,
  name: string,
  toasts: ToastStore | null,
  options: TrashOptions,
): Promise<void> {
  try {
    await trashed.undo();
  } catch (error) {
    const title = deleteWords.couldntUndo(name);
    const reason = reasonOf(error, title);
    toasts?.show({ tone: "danger", title, ...(reason === undefined ? {} : { text: reason }) });
    return;
  }
  options.onRestored?.();
}
