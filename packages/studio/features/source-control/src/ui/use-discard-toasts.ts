import { useToastStore } from "@halonicjs/studio-kit";
import type { DiscardOutcome } from "../changes-list.ts";
import { discardWords } from "../changes-words.ts";

/** What a discard's toast says, and what its Undo does. */
export interface DiscardToasts {
  /** Shows the toast for a finished discard; gives the reason when it failed. */
  readonly run: (
    outcome: DiscardOutcome,
    toast: { readonly title: string; readonly text?: string },
  ) => Promise<string | undefined>;
}

/** The toast every discard shows: what was discarded, with Undo, which puts it all back (none when no copy was kept). */
export function useDiscardToasts(): DiscardToasts {
  const toasts = useToastStore();
  return {
    run: async (outcome, { title, text }) => {
      if (outcome.kind === "failed") return outcome.reason;
      if (outcome.kind === "noCopy") return discardWords.noCopy;
      if (outcome.kind === "discarded") {
        toasts?.show({ tone: "success", title, ...(text === undefined ? {} : { text }) });
        return undefined;
      }
      const { undo } = outcome;
      toasts?.show({
        tone: "success",
        title,
        ...(text === undefined ? {} : { text }),
        action: {
          label: discardWords.undo,
          onClick: () =>
            void undo().then((reason) => {
              if (reason === undefined) return;
              toasts.show({ tone: "danger", title: discardWords.undoFailed, text: reason });
            }),
        },
      });
      return undefined;
    },
  };
}
