import {
  readWorkspaceKey,
  TauriDefinitionStore,
  type TauriFileShell,
  TauriFolderReader,
  TauriGoogleSetupRecords,
  type TauriShell,
  webCryptoDigest,
} from "@halonicjs/adapter-fs-tauri";
import type { ServiceRegistry } from "@halonicjs/app";
import { setupCollection, setupRecords } from "@halonicjs/google-setup";
import { systemClock } from "@halonicjs/std";
import { GoogleSetupAccountsService } from "@halonicjs/studio-feature-google-setup/api";
import { WorkspaceGoogleSetupAccounts } from "./workspace-google-setup-accounts.ts";

/** What the Google setup feature needs from the open folder and the shell. */
export interface GoogleSetupServiceParts {
  readonly ipc: TauriShell;
  readonly files: TauriFileShell;
  readonly location: string;
  /** Calls the listener whenever the window comes to the front; returns a function that stops it. */
  readonly onFocus: (listener: () => void) => () => void;
}

/**
 * Gives the Google setup feature the folder's Google accounts, read through the shell
 * (`studio.workspace-google-setup-accounts`): the connectors from the folder's files, the setup
 * records from the profile, and the key that links a record to this folder.
 */
export function provideGoogleSetup(
  services: ServiceRegistry,
  parts: GoogleSetupServiceParts,
): void {
  const { ipc, files, location, onFocus } = parts;
  // Only the records are read here, so nothing makes an account ref.
  const noIds = {
    next: (): never => {
      throw new Error("The desktop app doesn't start Google setups yet.");
    },
  };
  services.provide(
    GoogleSetupAccountsService,
    new WorkspaceGoogleSetupAccounts({
      definitions: new TauriDefinitionStore(files, location),
      folder: new TauriFolderReader(ipc, location),
      digest: webCryptoDigest,
      setups: setupRecords({
        records: new TauriGoogleSetupRecords(ipc, setupCollection),
        clock: systemClock,
        ids: noIds,
      }),
      workspaceKey: () => readWorkspaceKey(ipc, location),
      onFocus,
      onWatchError: (error) => console.error(error),
    }),
  );
}
