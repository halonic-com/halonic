/**
 * The services and types other features may use. Features import each
 * other only through this file.
 */
import type { SetupRecord, SetupService } from "@halonicjs/google-setup";
import type { InboxSetupSource } from "@halonicjs/studio-feature-inbox/api";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/** One Google account as the host reads it from the setup records and the connector settings. */
export interface GoogleSetupAccount {
  /** The random ref the account's setup record is kept under. Never an e-mail address. */
  readonly ref: string;
  /** The account's address, from the connector settings. It appears only in titles. */
  readonly email: string;
  /** The saved progress. */
  readonly record: SetupRecord;
  /** The services the setup is for, in the order Studio shows them. */
  readonly services: readonly SetupService[];
  /** Services ticked after the setup was done, which still need their steps. Usually none. */
  readonly adding: readonly SetupService[];
  /** How many routines wait for this account to be signed in. */
  readonly routinesOnHold: number;
  /** ISO time the setup, or the connection, last changed. */
  readonly changedAt: string;
}

/** The Google accounts of the open workspace. The app provides it. */
export interface GoogleSetupAccounts {
  /** Every connected account, whether its setup needs you or not. */
  list(): Promise<readonly GoogleSetupAccount[]>;
  /** Calls `listener` whenever an account may have changed. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

/** The open workspace's Google accounts. The app provides it for each open workspace. */
export const GoogleSetupAccountsService: ServiceKey<GoogleSetupAccounts> =
  serviceKey<GoogleSetupAccounts>("google-setup.accounts");

/** The Google setup source, offered so it is added to the Inbox when a workspace opens. */
export const GoogleSetupSourceService: ServiceKey<InboxSetupSource> =
  serviceKey<InboxSetupSource>("google-setup.source");
