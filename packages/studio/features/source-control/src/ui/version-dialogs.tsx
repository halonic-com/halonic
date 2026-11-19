import type { ChangesList, ChangesListState, VersionOpener } from "../changes-list.ts";
import { CreateVersionDialog } from "./create-version-dialog.tsx";
import { IdentityDialog } from "./identity-dialog.tsx";

/** Props for {@link VersionDialogs}. */
export interface VersionDialogsProps {
  readonly list: ChangesList;
  readonly state: ChangesListState;
  /** Who draws these: only a Create version this opener opened is drawn. */
  readonly opener: VersionOpener;
  /** Where focus goes when a dialog closes and the button that opened it has gone. */
  readonly returnFocus: () => HTMLElement | null;
  /** Called once the version is made and the list has read again. */
  readonly onCreated: () => void;
}

/**
 * Create version, with "Who should versions be from?" first while the workspace has no name or
 * email for versions. The Changes page and the feature's dialog host each draw the Create
 * version their opener opened, so it is never drawn twice. Nothing is drawn until the list has
 * read the changes.
 */
export function VersionDialogs({
  list,
  state,
  opener,
  returnFocus,
  onCreated,
}: VersionDialogsProps) {
  if (state.version?.opener !== opener) return null;
  // Another feature may open it before the first read: the offered name needs the files.
  if (state.read?.kind !== "ready") return null;
  if (list.needsIdentity) {
    return state.identity === undefined ? null : (
      <IdentityDialog list={list} initial={state.identity} returnFocus={returnFocus} />
    );
  }
  return (
    <CreateVersionDialog
      list={list}
      files={list.versionFiles}
      first={hasNoVersions(state.history)}
      returnFocus={returnFocus}
      onCreated={onCreated}
    />
  );
}

/** History has loaded and holds no version yet: the next one is the first. */
function hasNoVersions(history: { loaded: boolean; versions: readonly unknown[] }): boolean {
  return history.loaded && history.versions.length === 0;
}
