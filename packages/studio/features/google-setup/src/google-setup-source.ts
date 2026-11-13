import {
  clockTime,
  type InboxSetupSource,
  type SetupEntry,
  type SetupViewProps,
} from "@halonicjs/studio-feature-inbox/api";
import { createElement } from "react";
import type { GoogleSetupAccounts } from "./api.ts";
import { setupEntry, type TimeFormat } from "./setup-entry.ts";

/**
 * The Inbox's setup source for Google: one entry for each connected account that needs setup,
 * sign-in again, a new secret or a service added. Its view is the setup checklist, loaded when an
 * item opens and given these accounts to read and save.
 *
 * @example
 * inbox.addSetupSource(googleSetupSource(accounts));
 */
export function googleSetupSource(
  accounts: GoogleSetupAccounts,
  time: TimeFormat = clockTime,
  now: () => Date = () => new Date(),
): InboxSetupSource {
  return {
    provider: "google",
    name: "Google",
    view: {
      view: "GoogleSetupView",
      load: async () => {
        const { GoogleSetupView } = await import("./ui/google-setup-view.tsx");
        // The Inbox gives a view only its own props, so the accounts are added here.
        return {
          GoogleSetupView: (props: SetupViewProps) =>
            createElement(GoogleSetupView, { ...props, accounts }),
        };
      },
    },
    async list() {
      const entries: SetupEntry[] = [];
      for (const account of await accounts.list()) {
        const entry = setupEntry(account, time, now());
        if (entry !== undefined) entries.push(entry);
      }
      return entries;
    },
    subscribe: (listener) => accounts.subscribe(listener),
  };
}
