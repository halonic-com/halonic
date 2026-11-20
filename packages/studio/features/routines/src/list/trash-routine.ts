import type { ToastStore } from "@halonicjs/studio-kit";
import { errorMessageFor } from "@halonicjs/studio-shell";
import type { RoutineListing, RoutinesHost, TrashedRoutine } from "../api.ts";
import { rowMenuWords } from "./list-words.ts";

/** What {@link trashRoutine} needs to know of a routine: where it is, its name and what it starts. */
export type TrashedListing = Pick<RoutineListing, "hubId" | "id" | "name" | "targetName">;

/** The sentence a failure gives the person: a system message never reaches them. */
function reasonOf(error: unknown, title: string): string | undefined {
  const message = errorMessageFor(error, { title });
  const reason = message.body.trim();
  return message.kind === "internal" || reason === "" ? undefined : reason;
}

/** What {@link trashRoutine} can tell its caller. */
export interface TrashOptions {
  /** A page that is open says the move itself, with its own Undo, so no toast says it. */
  readonly quiet?: boolean;
  /** Called with the way back once the routine is in the trash, also after a Try again. */
  readonly onTrashed?: (trashed: TrashedRoutine) => void;
  /** Called once the toast's Undo has put the routine back. */
  readonly onRestored?: () => void;
}

/**
 * Moves a routine to the trash with no dialog and says so with a toast that has Undo and a second
 * line about what it stops (flow-routines 2.4); a page that is open says it itself and passes
 * `quiet`. When it can't be moved, a toast that stays says why and offers Try again. Undo that
 * can't put it back says why, too.
 */
export async function trashRoutine(
  host: RoutinesHost,
  toasts: ToastStore | null,
  listing: TrashedListing,
  options: TrashOptions = {},
): Promise<void> {
  const { name } = listing;
  let trashed: TrashedRoutine;
  try {
    trashed = await host.trash(listing);
  } catch (error) {
    toasts?.show({
      tone: "danger",
      title: rowMenuWords.couldntMove(name, reasonOf(error, name)),
      sticky: true,
      action: {
        label: rowMenuWords.tryAgain,
        onClick: () => void trashRoutine(host, toasts, listing, options),
      },
    });
    return;
  }
  options.onTrashed?.(trashed);
  if (options.quiet === true) return;
  toasts?.show({
    tone: "success",
    title: rowMenuWords.moved(name),
    text: rowMenuWords.movedLine(listing.targetName),
    action: {
      label: rowMenuWords.undo,
      onClick: () =>
        void putBackRoutine(trashed, name, toasts).then((restored) => {
          if (restored) options.onRestored?.();
        }),
    },
  });
}

/**
 * Puts a deleted routine back. When it can't, a toast says why.
 *
 * @returns whether the routine is back
 */
export async function putBackRoutine(
  trashed: TrashedRoutine,
  name: string,
  toasts: ToastStore | null,
): Promise<boolean> {
  try {
    await trashed.undo();
    return true;
  } catch (error) {
    const title = rowMenuWords.couldntUndo(name);
    const reason = reasonOf(error, title);
    toasts?.show({ tone: "danger", title, ...(reason === undefined ? {} : { text: reason }) });
    return false;
  }
}
