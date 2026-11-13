/**
 * The services and types other features may use. Features import each
 * other only through this file.
 */
import type { SetupEdit, SetupRecord, SetupService } from "@halonicjs/google-setup";
import type { InboxSetupSource } from "@halonicjs/studio-feature-inbox/api";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/** One Google account as the host reads it from the setup records and the connector settings. */
export interface GoogleSetupAccount {
  /** The account's address, from the connector settings. It appears only in titles. */
  readonly email: string;
  /** The saved progress. Its `accountRef` is the random ref, never an e-mail address. */
  readonly record: SetupRecord;
  /** The services the setup is for, in the order Studio shows them. */
  readonly services: readonly SetupService[];
  /** Services ticked after the setup was done, which still need their steps. Usually none. */
  readonly adding: readonly SetupService[];
  /** How many routines wait for this account to be signed in. */
  readonly routinesOnHold: number;
  /** ISO time the setup, or the connection, last changed. */
  readonly changedAt: string;
  /**
   * Whether the item still has to ask "What kind of Google account is …?": true for an address
   * Studio can't tell (not `@gmail.com`), until the user answers. The record's own type is a
   * guess until then, so the checklist stays shut.
   */
  readonly askAccountType: boolean;
  /**
   * The addresses of the other accounts whose setup uses the same client. **Start over** keeps
   * the client secret while any are listed, and says so. Usually none.
   */
  readonly clientSharedWith: readonly string[];
}

/** The Google accounts of the open workspace. The app provides it. */
export interface GoogleSetupAccounts {
  /** Every connected account, whether its setup needs you or not. */
  list(): Promise<readonly GoogleSetupAccount[]>;
  /**
   * Saves one change to an account's setup record, such as a step done, and tells the listeners.
   * It rejects when the engine can't save it; nothing changes then.
   */
  edit(accountRef: string, edit: SetupEdit): Promise<void>;
  /**
   * **Start over**: removes the account's setup, its sign-in and its client secret (unless another
   * account uses the client), and leaves a fresh setup at step 1 that `list` returns. It never
   * talks to Google. It rejects when the engine can't do it; nothing changes then.
   */
  startOver(accountRef: string): Promise<void>;
  /** Calls `listener` whenever an account may have changed. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

/** The open workspace's Google accounts. The app provides it for each open workspace. */
export const GoogleSetupAccountsService: ServiceKey<GoogleSetupAccounts> =
  serviceKey<GoogleSetupAccounts>("google-setup.accounts");

/** The Google setup source, offered so it is added to the Inbox when a workspace opens. */
export const GoogleSetupSourceService: ServiceKey<InboxSetupSource> =
  serviceKey<InboxSetupSource>("google-setup.source");
