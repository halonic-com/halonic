import type { Plugin } from "@halonicjs/format";
import { useToastStore } from "@halonicjs/studio-kit";
import { messageOf } from "../message-of.ts";
import { signedOutNotConfirmed } from "../sign-in/sign-in-text.ts";
import {
  ACTION_WORDS,
  ADDED_OFF_TOAST_BODY,
  actionFailedLine,
  addedOffToast,
  onToast,
  onToastBody,
  type PluginSignOut,
  removedToast,
} from "./plugin-actions.ts";

/**
 * Runs a page action, and says in a toast when it fails: "Couldn't remove trust: *reason*."
 * `fail` says the same for an action that needs its result, so it can't go through `run`.
 * `toastRemoved` is the Remove dialog's success: "*name* removed". `toastSignedOut` follows a
 * **Remove trust** that worked, and says something only when a sign-out wasn't confirmed. Both then
 * warn with **Sign out**'s words, as the CLI does (`app.plugin-sign-out`). `toastOn` is a trust that
 * was saved: "*name* is on". `toastAddedOff` is **Not now** on a plugin that was just added:
 * "*name* is added but off".
 */
export function usePageActions() {
  const toasts = useToastStore();
  const fail = (action: keyof typeof ACTION_WORDS, error: unknown) => {
    const title = actionFailedLine(ACTION_WORDS[action], messageOf(error));
    toasts?.show({ tone: "danger", title });
  };
  return {
    fail,
    run: async (action: keyof typeof ACTION_WORDS, work: () => Promise<void>) => {
      try {
        await work();
      } catch (error) {
        fail(action, error);
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
    toastSignedOut: (name: string, signOut: PluginSignOut) => {
      const warning = notConfirmedLine(name, signOut);
      if (warning !== undefined) toasts?.show({ tone: "warning", title: warning });
    },
    toastRemoved: (name: string, signOut: PluginSignOut) => {
      const warning = notConfirmedLine(name, signOut);
      toasts?.show(
        warning === undefined
          ? { tone: "success", title: removedToast(name) }
          : { tone: "warning", title: removedToast(name), text: warning },
      );
    },
  };
}

/** **Sign out**'s words when a sign-in's token may still work at the provider; `undefined` otherwise. */
function notConfirmedLine(name: string, signOut: PluginSignOut): string | undefined {
  const tokens = signOut.signInsNotConfirmed.length;
  return tokens === 0 ? undefined : signedOutNotConfirmed(name, tokens);
}
