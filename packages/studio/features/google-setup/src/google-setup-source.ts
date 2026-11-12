import type { InboxSetupSource, SetupEntry } from "@halonicjs/studio-feature-inbox/api";
import type { GoogleSetupAccounts } from "./api.ts";
import { setupEntry, type TimeFormat, utcTime } from "./setup-entry.ts";

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
  time: TimeFormat = utcTime,
): InboxSetupSource {
  return {
    provider: "google",
    name: "Google",
    async list() {
      const entries: SetupEntry[] = [];
      for (const account of await accounts.list()) {
        const entry = setupEntry(account, time);
        if (entry !== undefined) entries.push(entry);
      }
      return entries;
    },
    subscribe: (listener) => accounts.subscribe(listener),
  };
}
