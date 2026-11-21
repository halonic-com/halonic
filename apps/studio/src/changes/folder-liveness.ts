import type { WorkspaceScope } from "@halonicjs/app";
import type { DefinitionSource } from "@halonicjs/ports";
import type { WatchedChanges } from "./watched-changes.ts";
import { WorkspaceLiveness } from "./workspace-liveness.ts";

/** What {@link folderLiveness} reads and listens to. */
export interface FolderLivenessParts {
  /** The workspace's history, which also says when a version is made. */
  readonly changes: Pick<WatchedChanges, "read" | "readTexts" | "readHistory" | "onNewVersion">;
  /** The folder's saved files. */
  readonly saved: DefinitionSource;
  /** The folder's events, for a file saved here or changed on disk. */
  readonly events: Pick<WorkspaceScope["events"], "on">;
}

/**
 * The live state of the folder's agents and routines, for their hosts' `liveness` part, and
 * `onChange`, which tells a host to read it again: an item's live state changes with its saved
 * file, and with a new version, which changes no file.
 *
 * @example
 * const { liveness, onChange } = folderLiveness({ changes, saved, events: scope.events });
 */
export function folderLiveness({ changes, saved, events }: FolderLivenessParts): {
  readonly liveness: WorkspaceLiveness;
  readonly onChange: (listener: () => void) => () => void;
} {
  return {
    liveness: new WorkspaceLiveness({ history: changes, saved }),
    onChange: (listener) => {
      const stops = [
        events.on("files.changed", listener),
        events.on("files.saved", listener),
        changes.onNewVersion(listener),
      ];
      return () => {
        for (const stop of stops) stop();
      };
    },
  };
}
