import type { Plugin } from "@halonicjs/format";
import { useToastStore } from "@halonicjs/studio-kit";
import { messageOf } from "../message-of.ts";
import {
  ACTION_WORDS,
  ADDED_OFF_TOAST_BODY,
  actionFailedLine,
  addedOffToast,
  onToast,
  onToastBody,
  removedToast,
} from "./plugin-actions.ts";

/**
 * Runs a page action, and says in a toast when it fails: "Couldn't remove trust: *reason*."
 * `toastRemoved` is the Remove dialog's success: "*name* removed". `toastOn` is a trust that was
 * saved: "*name* is on". `toastAddedOff` is **Not now** on a plugin that was just added: "*name* is
 * added but off".
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
    toastOn: (name: string, manifest: Plugin | undefined) => {
      const text = onToastBody(manifest);
      toasts?.show({
        tone: "success",
        title: onToast(name),
        ...(text === undefined ? {} : { text }),
      });
    },
    toastAddedOff: (name: string) => {
      toasts?.show({ tone: "info", title: addedOffToast(name), text: ADDED_OFF_TOAST_BODY });
    },
    toastRemoved: (name: string) => {
      toasts?.show({ tone: "success", title: removedToast(name) });
    },
  };
}
