import {
  TauriDefinitionStore,
  type TauriFileShell,
  webCryptoDigest,
} from "@halonicjs/adapter-fs-tauri";
import type { ServiceRegistry, WorkspaceScope } from "@halonicjs/app";
import { VersionHistoryHostService } from "@halonicjs/studio-feature-runs/api";
import {
  ChangesSourceService,
  ShareChoiceService,
} from "@halonicjs/studio-feature-source-control/api";
import type { TauriIpc } from "@halonicjs/studio-services";
import { focusOf, storageOf } from "../studio/page-window.ts";
import { folderLiveness } from "./folder-liveness.ts";
import { shareChoiceMemory } from "./share-choice.ts";
import { versionHistoryOf } from "./version-history.ts";
import { WatchedChanges } from "./watched-changes.ts";
import type { GitAnswer } from "./workspace-changes.ts";
import { choicesMemory } from "./workspace-merge.ts";

/** What {@link provideChangesServices} reads: the shell, the page's window and the folder. */
export interface ChangesServiceParts {
  readonly ipc: TauriIpc;
  readonly files: TauriFileShell;
  readonly window: object;
  readonly location: string;
  readonly scope: WorkspaceScope;
}

/**
 * Gives the folder in `location` source control's Changes and its version history, and answers
 * them with the live state of the folder's agents and routines, which other hosts read.
 *
 * @example
 * const { changes, liveness, onLivenessChange } = provideChangesServices(services, parts);
 */
export function provideChangesServices(
  services: ServiceRegistry,
  { ipc, files, window, location, scope }: ChangesServiceParts,
) {
  const changes = new WatchedChanges({
    git: async (args) =>
      (await ipc.invoke("git", { root: location, args: [...args] })) as GitAnswer,
    files: new TauriDefinitionStore(files, location),
    // `.studio/discarded`, which the folder's own store refuses as private.
    copies: new TauriDefinitionStore(files, location, { folder: "discarded" }),
    choices: choicesMemory(storageOf(window), location),
    digest: webCryptoDigest,
    onFocus: (listener) => focusOf(window, listener),
    onFilesChanged: (listener) => scope.events.on("files.changed", listener),
  });
  services.provide(ChangesSourceService, changes);
  services.provide(VersionHistoryHostService, versionHistoryOf(changes));
  services.provide(ShareChoiceService, shareChoiceMemory(storageOf(window), location));
  const { liveness, onChange: onLivenessChange } = folderLiveness({
    changes,
    saved: new TauriDefinitionStore(files, location),
    events: scope.events,
  });
  return { changes, liveness, onLivenessChange };
}
