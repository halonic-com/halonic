import { useToastStore } from "@halonicjs/studio-kit";
import { messageOf } from "../message-of.ts";
import { ACTION_WORDS, actionFailedLine, removedToast } from "./plugin-actions.ts";

/**
 * Runs a page action, and says in a toast when it fails: "Couldn't remove trust: *reason*."
 * `toastRemoved` is the Remove dialog's success: "*name* removed".
 */
export function usePageActions() {
  const toasts = useToastStore();
  return {
    run: async (action: keyof typeof ACTION_WORDS, work: () => Promise<void>) => {
      try {
        await work();
      } catch (error) {
        const title = actionFailedLine(ACTION_WORDS[action], messageOf(error));
        toasts?.show({ tone: "danger", title });
      }
    },
    toastRemoved: (name: string) => {
      toasts?.show({ tone: "success", title: removedToast(name) });
    },
  };
}
