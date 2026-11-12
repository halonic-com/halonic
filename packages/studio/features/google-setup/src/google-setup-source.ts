import {
  clockTime,
  type InboxSetupSource,
  type SetupEntry,
} from "@halonicjs/studio-feature-inbox/api";
import type { GoogleSetupAccounts } from "./api.ts";
import { setupEntry, type TimeFormat } from "./setup-entry.ts";

/**
 * The Inbox's setup source for Google: one entry for each connected account that needs setup,
 * sign-in again, a new secret or a service added. The Inbox's own card shows each item until a
 * richer view is added (HAL-712).
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
