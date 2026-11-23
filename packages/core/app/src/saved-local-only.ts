// Local only counts as on when the live version or the saved files say on (`app.saved-local-only`,
// HAL-16400, HAL-16406). A workspace with history starts its runs from the live version, so
// without this, turning Local only on and saving would leave runs calling models in the cloud
// until the change is made live. The Studio and the CLI (`run`, `runs send`, `routines watch`,
// `serve`) both read it here. Turning it off still waits for Make live: a run never makes a cloud
// call the person just turned off.

import { parseFile } from "@halonicjs/format";
import type { DefinitionSource } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import {
  filesOf,
  isUnreadable,
  type LoadedFile,
  type LoadedWorkspace,
  unreadableFileError,
} from "@halonicjs/workspace";

const workspacePath = "workspace.yaml";

/**
 * The live version's workspace, with Local only turned on when the saved `workspace.yaml` says on.
 * Only that file is read of the saved files, and only while the live version has Local only off.
 *
 * @param live the live version's workspace; it is never changed, a copy is returned
 * @param saved the saved files
 * @throws KindedError `invalid_input` when the saved `workspace.yaml` can't be read or has an
 *   error: it might turn Local only on, so nothing starts until it is fixed
 */
export async function withSavedLocalOnly(
  live: LoadedWorkspace,
  saved: DefinitionSource,
): Promise<LoadedWorkspace> {
  const liveFile = filesOf(live, "workspace")[0];
  if (liveFile?.value.privacy.localOnly === true) return live;
  const savedValue = await savedWorkspaceValue(saved);
  if (savedValue?.privacy.localOnly !== true) return live;
  // A live version whose workspace.yaml didn't parse has no flag to raise: the saved file's
  // settings stand in, so Local only still counts as on.
  const settings = liveFile?.value ?? savedValue;
  const value = { ...settings, privacy: { ...settings.privacy, localOnly: true } };
  const file: LoadedFile = { path: workspacePath, kind: "workspace", hub: null, value };
  const others = live.files.filter((each) => each.kind !== "workspace");
  // Sorted by path, as the loader gives them.
  const files = [...others, file].sort((a, b) => (a.path < b.path ? -1 : 1));
  return { ...live, files };
}

/**
 * The saved `workspace.yaml`'s settings, or `undefined` when there is none: then the format's
 * default, not local only, holds, and the live version decides.
 */
async function savedWorkspaceValue(saved: DefinitionSource) {
  const text = await readSaved(saved);
  if (text === null) return undefined;
  const parsed = parseFile("workspace", text);
  if (parsed.ok) return parsed.value.value;
  const line = parsed.error[0]?.line ?? 1;
  throw new KindedError(
    "invalid_input",
    `The saved workspace.yaml has an error on line ${line}, so Halonic can't tell whether Local only is on. Nothing started.`,
    { fix: "Fix the error in workspace.yaml, then try again." },
  );
}

/** The saved `workspace.yaml`'s text, with a file the account may not read named as the loader does. */
async function readSaved(saved: DefinitionSource): Promise<string | null> {
  try {
    return await saved.read(workspacePath);
  } catch (error) {
    if (!isUnreadable(error)) throw error;
    throw unreadableFileError(workspacePath, error);
  }
}
