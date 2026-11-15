import { readLocalIntegrations } from "@halonicjs/app";
import type { SetupRecord, SetupRecords } from "@halonicjs/google-setup";
import type { DefinitionStore, DefinitionWatch, Digest, FolderReader } from "@halonicjs/ports";
import type {
  GoogleSetupAccount,
  GoogleSetupAccounts,
  SecretEntry,
} from "@halonicjs/studio-feature-google-setup/api";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";
import { googleAccountOf } from "./google-account.ts";
import { googleServices } from "./google-services.ts";

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
  /** Calls its listener when the window comes to the front; returns a function that stops it. */
  readonly onFocus?: (listener: () => void) => () => void;
  /** Called with the error when the files can't be watched; the Studio logs it. */
  readonly onWatchError?: (error: unknown) => void;
}

/** Said when a change is tried: the desktop app can read a setup but not write one yet. */
const notYet =
  "This can't be saved in the Halonic app yet. Use the halonic google commands in a terminal for now.";

/** The client secret is typed in the app's own field; where it is kept is this computer. */
const desktopEntry: SecretEntry = { kind: "field", keptOn: "this-computer", plainHttp: false };

/**
 * The Google accounts of one open workspace as the Google setup feature reads them (requirement
 * `studio.workspace-google-setup-accounts`).
 *
 * A Google connector is an account once it has a setup record linked to this workspace and its
 * id. The record is found by `forConnector` with the workspace's key, so another workspace's
 * connector with the same id is never this one's. A connector with no record has no account yet:
 * starting a setup is a later step. Every change is refused with a plain message, since the
 * desktop app has no way to write the records, the sign-in or the secret yet.
 *
 * @example
 * services.provide(GoogleSetupAccountsService, new WorkspaceGoogleSetupAccounts(options));
 */
export class WorkspaceGoogleSetupAccounts implements GoogleSetupAccounts {
  readonly secretEntry = desktopEntry;
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

  async edit(): Promise<void> {
    throw new Error(notYet);
  }

  async saveClientSecret(): Promise<void> {
    throw new Error(notYet);
  }

  async replaceClientSecret(): Promise<never> {
    throw new Error(notYet);
  }

  async startOver(): Promise<void> {
    throw new Error(notYet);
  }

  async disconnect(): Promise<never> {
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

  /** Listens to the window's focus and the files, for as long as anyone listens. */
  #startWatching(): void {
    if (this.#stopWatching !== undefined) return;
    const tell = () => {
      for (const listener of [...this.#listeners]) listener();
    };
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

  #stopWatchingAll(): void {
    this.#stopWatching?.();
    this.#stopWatching = undefined;
  }
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
