/**
 * The services and types other features may use. Features import each
 * other only through this file.
 */
import type { SetupEdit, SetupRecord, SetupService } from "@halonicjs/google-setup";
import type { InboxSetupSource } from "@halonicjs/studio-feature-inbox/api";
import type { SecretText } from "@halonicjs/studio-kit";
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

/**
 * Where the client secret can be typed (design 4.1). The host knows how Studio reaches it, so the
 * view never guesses from the address bar.
 */
export type SecretEntry =
  /** The field is there. `keptOn` says which computer keeps the secret, for the hint's words. */
  | {
      readonly kind: "field";
      readonly keptOn: "this-computer" | "host-computer";
      /** Served over plain http: the first save asks for a confirm, since the secret travels unencrypted. */
      readonly plainHttp: boolean;
    }
  /**
   * There is no field: the browser demo, or a served Studio without a password. `commandExists`
   * says whether `halonic google secret <account>` can be shown instead (it is a later feature of
   * the host, so it is false until the host has it).
   */
  | {
      readonly kind: "unavailable";
      readonly reason: "demo" | "no-password";
      readonly commandExists: boolean;
    };

/**
 * What the host says after a new client secret was sent (design 4.3). Before the first sign-in the
 * new secret replaces the old one at once (`replaced`). After it, the host checks the new secret
 * with Google first, and swaps it in only when Google accepts it (`accepted`).
 */
export type SecretReplaceAnswer =
  /** Google accepted it. `usedBy` lists every account address now on it, this account's too. */
  | { readonly kind: "accepted"; readonly usedBy: readonly string[] }
  /** Replaced straight away, because the setup hasn't been signed in yet: step 7 checks it. */
  | { readonly kind: "replaced" }
  /** Google refused it. The old secret is still saved and in use. */
  | { readonly kind: "refused" }
  /** Google couldn't be reached to check it. The old secret is still in use. */
  | { readonly kind: "no-network" };

/**
 * What the host says after **Disconnect Google…** (design 4.4). Either way the account's sign-in
 * and, unless another account uses the client, its client secret are deleted here.
 */
export type DisconnectAnswer =
  /** Google was asked to end the sign-in and did. */
  | { readonly kind: "ended" }
  /** Google couldn't be reached to end the sign-in. It is still deleted here; access can be removed in the Google account. */
  | { readonly kind: "google-unreachable" };

/** The Google accounts of the open workspace. The app provides it. */
export interface GoogleSetupAccounts {
  /** How the client secret is entered on this host. It doesn't change while the workspace is open. */
  readonly secretEntry: SecretEntry;
  /** Every connected account, whether its setup needs you or not. */
  list(): Promise<readonly GoogleSetupAccount[]>;
  /**
   * Saves one change to an account's setup record, such as a step done, and tells the listeners.
   * It rejects when the engine can't save it; nothing changes then.
   */
  edit(accountRef: string, edit: SetupEdit): Promise<void>;
  /**
   * Sends the client secret to the secret store on its own request, never as part of the setup
   * record (design 4.2). The host keeps it and records only that it is saved, then tells the
   * listeners. It rejects when it can't be saved; nothing was saved then. The rejection never
   * holds the secret.
   */
  saveClientSecret(accountRef: string, secret: SecretText): Promise<void>;
  /**
   * Sends a new client secret for an account that has one, on its own request like
   * `saveClientSecret`. The host stages it, checks it with Google and tells the answer; it never
   * replaces a working secret with one Google refused. It rejects when the engine can't do it;
   * nothing changed then. Neither the answer nor a rejection ever holds the secret.
   */
  replaceClientSecret(accountRef: string, secret: SecretText): Promise<SecretReplaceAnswer>;
  /**
   * **Start over**: removes the account's setup, its sign-in and its client secret (unless another
   * account uses the client), and leaves a fresh setup at step 1 that `list` returns. It never
   * talks to Google. It rejects when the engine can't do it; nothing changes then.
   */
  startOver(accountRef: string): Promise<void>;
  /**
   * **Disconnect Google…**: asks Google to end the account's sign-in, then deletes the sign-in and
   * the client secret (unless another account uses the client) and leaves a fresh setup that
   * `list` returns. It deletes locally even when Google can't be reached, and says so. It rejects
   * when the engine can't do it; nothing changes then. Neither the answer nor a rejection ever
   * holds a token or the secret.
   */
  disconnect(accountRef: string): Promise<DisconnectAnswer>;
  /**
   * **Sign in with Google** (design 3.5): the host makes the account's pending sign-in and gives
   * the address to open in the browser. A second call replaces the pending sign-in, so a sign-in
   * that is waiting is reopened from the address already given, not started again. It rejects when
   * the host can't start one, with a reason a person can read. The address holds no secret.
   */
  startSignIn(accountRef: string): Promise<string>;
  /**
   * **Cancel** while waiting: the host drops the account's pending sign-in, so a callback that
   * still arrives is refused. It rejects when the host can't.
   */
  cancelSignIn(accountRef: string): Promise<void>;
  /** Calls `listener` whenever an account may have changed. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

/** The open workspace's Google accounts. The app provides it for each open workspace. */
export const GoogleSetupAccountsService: ServiceKey<GoogleSetupAccounts> =
  serviceKey<GoogleSetupAccounts>("google-setup.accounts");

/** The Google setup source, offered so it is added to the Inbox when a workspace opens. */
export const GoogleSetupSourceService: ServiceKey<InboxSetupSource> =
  serviceKey<InboxSetupSource>("google-setup.source");

/** What an account's setup record says in the library's terms, for the library's status view. */
export { connectorFacts } from "./connector-facts.ts";
/** The connector page's Google block, for the page that mounts it. */
export { GoogleConnectorBlock, type GoogleConnectorBlockProps } from "./ui/connector-block.tsx";
