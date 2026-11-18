import type { GoogleSecretReplaced } from "@halonicjs/adapter-agent-host-client";
import { readLocalIntegrations } from "@halonicjs/app";
import type { AccountType, SetupEdit, SetupRecord, SetupRecords } from "@halonicjs/google-setup";
import type { DefinitionStore, DefinitionWatch, Digest, FolderReader } from "@halonicjs/ports";
import type {
  CheckAgainEntry,
  DisconnectAnswer,
  GoogleSetupAccount,
  GoogleSetupAccounts,
  SecretEntry,
  SecretReplaceAnswer,
  SignInEntry,
} from "@halonicjs/studio-feature-google-setup/api";
import type { SecretText } from "@halonicjs/studio-kit";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";
import { googleAccountOf } from "./google-account.ts";
import { googleServices } from "./google-services.ts";

/** What changes a Google setup, on the agent host, which holds the sealed tokens. */
export interface GoogleSetupHost {
  /** Ends the account's sign-in and removes its sign-in, record and client secret. Rejects when the host can't. */
  disconnect(accountRef: string): Promise<{ readonly googleConfirmed: boolean }>;
  /** Starts a record for the connector, which keeps the link to it, and answers the record's ref. */
  start(
    connector: { readonly workspace: string; readonly id: string },
    accountType: AccountType,
  ): Promise<string>;
  /** Applies one change a person makes to the record. */
  edit(accountRef: string, change: SetupEdit): Promise<void>;
  /** Keeps a client secret for an account that has none. The host reveals the text once, in its request. */
  saveClientSecret(accountRef: string, secret: SecretText): Promise<void>;
  /** Replaces the account's client secret; the host checks it with Google when the old one was used. */
  replaceClientSecret(accountRef: string, secret: SecretText): Promise<GoogleSecretReplaced>;
  /**
   * Removes the record, the sign-in and the client secret (unless another account uses it),
   * without asking Google, and starts a fresh record for the same connector, all in one step.
   */
  startOver(
    accountRef: string,
  ): Promise<{ readonly clientSecret: string; readonly accountRef: string }>;
  /** Starts the sign-in and answers the address to open in the browser. */
  startSignIn(accountRef: string): Promise<string>;
  /** Drops the pending sign-in. */
  cancelSignIn(accountRef: string): Promise<void>;
}

/** What {@link WorkspaceGoogleSetupAccounts} reads. */
export interface WorkspaceGoogleSetupAccountsOptions {
  /** The workspace's files, where its Google connectors are declared. */
  readonly definitions: DefinitionStore;
  /** The workspace's folder, for the integration sheets that ask for Google scopes. */
  readonly folder: FolderReader;
  /** For the hash of each integration folder, as the trust check reads it. */
  readonly digest: Digest;
  /** The setup records, read-only in the desktop app. */
  readonly setups: SetupRecords;
  /** The workspace's key in the profile, which the record's connector link names. */
  readonly workspaceKey: () => Promise<string>;
  /** The agent host that changes a setup, when the app has one; without it every change is refused. */
  readonly host?: GoogleSetupHost;
  /** Calls its listener when the window comes to the front; returns a function that stops it. */
  readonly onFocus?: (listener: () => void) => () => void;
  /** Called with the error when the files can't be watched; the Studio logs it. */
  readonly onWatchError?: (error: unknown) => void;
}

/** Said when a change is tried that Studio can't make yet. */
const notYet = "Studio can't save this change yet.";

/**
 * Said when the agent host couldn't disconnect. It doesn't say nothing was removed: the answer
 * can be lost after the host finished, so the page reads the list again to show what is left.
 */
const disconnectFailed = "Halonic couldn't finish disconnecting this account.";

/** What the host said, in its own words when it gave some. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : "The agent host didn't answer.";
}

/** Said when a change is tried in a window that has no agent host to make it. */
const needsHost = "Halonic needs its agent host to save this, and it isn't running.";

/** The client secret is typed in the app's own field; where it is kept is this computer. */
const desktopEntry: SecretEntry = { kind: "field", keptOn: "this-computer", plainHttp: false };

/** The app runs on the computer that runs Halonic, so Google's answer comes back to it. */
const desktopSignIn: SignInEntry = { kind: "here" };

/** The app can't check the services again yet; signing in again in a terminal does (HAL-12363, L8). */
const desktopCheckAgain: CheckAgainEntry = { kind: "sign-in-again", where: "terminal" };

/**
 * The Google accounts of one open workspace as the Google setup feature reads them (requirement
 * `studio.workspace-google-setup-accounts`).
 *
 * A Google connector is an account once it has a setup record linked to this workspace and its
 * id. The record is found by `forConnector` with the workspace's key, so another workspace's
 * connector with the same id is never this one's. A connector with no record has no account yet:
 * `start` makes one, with the link to the connector. The page never writes a record: the agent
 * host does, so `start`, `edit`, `startOver` and the sign-in go to it, and are refused in plain
 * words when the app has none. The client secret goes to the host in its own request; the checks can't be done in the app yet.
 *
 * @example
 * services.provide(GoogleSetupAccountsService, new WorkspaceGoogleSetupAccounts(options));
 */
export class WorkspaceGoogleSetupAccounts implements GoogleSetupAccounts {
  readonly secretEntry = desktopEntry;
  readonly signInEntry = desktopSignIn;
  readonly checkAgainEntry = desktopCheckAgain;
  readonly #options: WorkspaceGoogleSetupAccountsOptions;
  readonly #listeners = new Set<() => void>();
  #stopWatching: (() => void) | undefined;

  constructor(options: WorkspaceGoogleSetupAccountsOptions) {
    this.#options = options;
  }

  async list(): Promise<readonly GoogleSetupAccount[]> {
    const { definitions, folder, digest, setups, workspaceKey } = this.#options;
    const connectors = filesOf(await loadWorkspace(definitions), "connector").flatMap(
      ({ value }) =>
        "google" in value.transport
          ? [{ id: value.id, email: value.transport.google.account }]
          : [],
    );
    if (connectors.length === 0) return [];
    const key = await workspaceKey();
    const services = googleServices(await readLocalIntegrations(folder, digest));
    const records: { id: string; email: string; record: SetupRecord }[] = [];
    for (const connector of connectors) {
      const record = await setups.forConnector(key, connector.id);
      if (record !== null) records.push({ ...connector, record });
    }
    return records.map(({ email, record }) =>
      googleAccountOf({
        email,
        record,
        services,
        clientSharedWith: sharingClient(records, record),
      }),
    );
  }

  /**
   * Starts a setup for one of this workspace's connectors, so it becomes an account that `list`
   * returns. A connector that already has a record keeps it.
   *
   * @returns the record's ref
   */
  async start(connectorId: string, accountType: AccountType): Promise<string> {
    const host = this.#host();
    const workspace = await this.#options.workspaceKey();
    const existing = await this.#options.setups.forConnector(workspace, connectorId);
    if (existing !== null) return existing.accountRef;
    return this.#asked("start this setup", () =>
      host.start({ workspace, id: connectorId }, accountType),
    );
  }

  async edit(accountRef: string, edit: SetupEdit): Promise<void> {
    const host = this.#host();
    await this.#asked("save this", () => host.edit(accountRef, edit));
  }

  async saveClientSecret(accountRef: string, secret: SecretText): Promise<void> {
    const host = this.#host();
    await this.#asked("save the client secret", () => host.saveClientSecret(accountRef, secret));
  }

  async replaceClientSecret(accountRef: string, secret: SecretText): Promise<SecretReplaceAnswer> {
    const host = this.#host();
    const answer = await this.#asked("replace the client secret", () =>
      host.replaceClientSecret(accountRef, secret),
    );
    if (answer.result !== "accepted") return replaceAnswerOf(answer);
    return { kind: "accepted", usedBy: await this.#usingClient(accountRef) };
  }

  async startOver(accountRef: string): Promise<void> {
    const host = this.#host();
    await this.#asked("start over", () => host.startOver(accountRef));
  }

  async disconnect(accountRef: string): Promise<DisconnectAnswer> {
    const host = this.#host();
    let answer: { readonly googleConfirmed: boolean };
    try {
      answer = await host.disconnect(accountRef);
    } catch (error) {
      this.#tellListeners();
      throw new Error(`${disconnectFailed} ${reasonOf(error)}`, { cause: error });
    }
    this.#tellListeners();
    return answer.googleConfirmed ? { kind: "ended" } : { kind: "google-unreachable" };
  }

  async startSignIn(accountRef: string): Promise<string> {
    const host = this.#host();
    return this.#asked("start the sign-in", () => host.startSignIn(accountRef));
  }

  async cancelSignIn(accountRef: string): Promise<void> {
    const host = this.#host();
    await this.#asked("cancel the sign-in", () => host.cancelSignIn(accountRef));
  }

  async checkAgain(): Promise<never> {
    throw new Error(notYet);
  }

  async wrongAccount(): Promise<never> {
    throw new Error(notYet);
  }

  async changeAddress(): Promise<never> {
    throw new Error(notYet);
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    this.#startWatching();
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) this.#stopWatchingAll();
    };
  }

  /**
   * The addresses of every account that uses the account's client secret, this one first. They
   * are read after the host answered, so they show who the new secret applies to, which is not
   * only the accounts whose "client refused" mark the host cleared.
   */
  async #usingClient(accountRef: string): Promise<string[]> {
    const accounts = await this.list();
    const own = accounts.find(({ record }) => record.accountRef === accountRef);
    return own === undefined ? [] : [own.email, ...own.clientSharedWith];
  }

  /** The agent host that makes a change, or a refusal in plain words when the app has none. */
  #host(): GoogleSetupHost {
    const { host } = this.#options;
    if (host === undefined) throw new Error(needsHost);
    return host;
  }

  /**
   * Runs one change on the host and tells the listeners afterwards, also when it failed: the
   * host may have finished before the answer was lost, so the page reads the accounts again.
   */
  async #asked<T>(what: string, change: () => Promise<T>): Promise<T> {
    try {
      return await change();
    } catch (error) {
      throw new Error(`Halonic couldn't ${what}. ${reasonOf(error)}`, { cause: error });
    } finally {
      this.#tellListeners();
    }
  }

  /** Listens to the window's focus and the files, for as long as anyone listens. */
  #startWatching(): void {
    if (this.#stopWatching !== undefined) return;
    const tell = () => this.#tellListeners();
    const stopFocus = this.#options.onFocus?.(tell) ?? (() => {});
    const reportWatchError = (error: unknown) => this.#options.onWatchError?.(error);
    // A watch that fails or never opens costs only the live update: the files are still read
    // again on focus. The error is reported, not swallowed.
    const watch: Promise<DefinitionWatch | undefined> = this.#options.definitions
      .watch({ changed: tell, failed: reportWatchError })
      .catch((error: unknown) => {
        reportWatchError(error);
        return undefined;
      });
    this.#stopWatching = () => {
      stopFocus();
      void watch.then((open) => open?.close());
    };
  }

  #tellListeners(): void {
    for (const listener of [...this.#listeners]) listener();
  }

  #stopWatchingAll(): void {
    this.#stopWatching?.();
    this.#stopWatching = undefined;
  }
}

/** Said when the check of a new client secret couldn't finish; the old secret is still in use. */
const replaceUnfinished =
  "Halonic couldn't finish checking the new client secret with Google. The old one is still in use.";

/** What the page shows for how the host's replace ended; an unfinished check is a rejection. */
function replaceAnswerOf(
  answer: Exclude<GoogleSecretReplaced, { readonly result: "accepted" }>,
): SecretReplaceAnswer {
  switch (answer.result) {
    case "replaced":
      return { kind: "replaced" };
    case "refused":
      return { kind: "refused" };
    case "unreachable":
      return { kind: "no-network" };
    case "signInRefused":
    case "nothingStaged":
    case "notSignedIn":
    case "googleError":
    case "unexpectedAnswer":
      throw new Error(replaceUnfinished);
    default:
      return unhandled(answer.result);
  }
}

/** Fails to compile when a case of `value` isn't handled above. */
function unhandled(value: never): never {
  throw new Error(`Unhandled answer: ${JSON.stringify(value)}`);
}

/** The addresses of the other accounts of this workspace whose setup uses the record's client. */
function sharingClient(
  accounts: readonly { email: string; record: SetupRecord }[],
  record: SetupRecord,
): string[] {
  const client = record.clientSecret?.clientRef;
  if (client === undefined) return [];
  return accounts
    .filter((other) => other.record.accountRef !== record.accountRef)
    .filter((other) => other.record.clientSecret?.clientRef === client)
    .map((other) => other.email);
}
