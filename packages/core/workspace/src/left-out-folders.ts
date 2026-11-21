// What the loader leaves out of the workspace's listing and version
// (requirement workspace.load-leaves-out-working-folders, HAL-13334): the
// working folders harness agents write in, and every `node_modules` folder.
// Both can hold tens of thousands of files and no definitions, and a folder
// store would otherwise read every byte of them on every load.

import { fileKinds, foldName, kindNames, PROTECTED_TOP_NAMES } from "@halonicjs/format";
import type { LeaveOut } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { harnessWorkingFoldersOf } from "./harness-working-folders.ts";
import type { LoadedFileOf } from "./load-workspace.ts";

/** The folder name left out at any depth: installed packages, never definitions. */
export const leftOutNames: readonly string[] = ["node_modules"];

/** The folder that holds the hubs; every hub-scoped place sits under it. */
const hubsFolder = "hubs";

/**
 * The first part of every path a definition can sit at, folded: each kind's
 * folder or root file, the hubs, and the protected names the format keeps
 * agents out of. Worked out from the kinds here as well, so a working folder
 * can never leave out a definition even if the format's list missed a kind.
 */
function definitionTopNames(): Set<string> {
  const names = new Set(PROTECTED_TOP_NAMES.map(foldName));
  for (const kind of kindNames()) {
    for (const place of fileKinds[kind].places) {
      if (place.scope !== "workspace") {
        names.add(foldName(hubsFolder));
      }
      const top = place.folder === "" ? place.name : place.folder.split("/")[0];
      if (top !== undefined) {
        names.add(foldName(top));
      }
    }
  }
  return names;
}

const definitionTops = definitionTopNames();

/**
 * The folders under which the agent files sit, at the workspace root and in
 * the hubs, so the loader can list them before it knows what to leave out.
 * An agent file can't sit in a working folder: those folders are refused by
 * {@link leaveOutFor} and by the format.
 *
 * @example
 * agentFolders(); // ["agents", "hubs"]
 */
export function agentFolders(): string[] {
  const folders = new Set<string>();
  for (const place of fileKinds.agent.places) {
    if (place.scope !== "hub") {
      folders.add(place.folder);
    }
    if (place.scope !== "workspace") {
      folders.add(hubsFolder);
    }
  }
  return [...folders].sort();
}

/**
 * What the loader leaves out, from the agent files it parsed: every harness
 * agent's working folder and every `node_modules` folder. An agent file that
 * didn't parse isn't among `agents`, so it leaves nothing out: the loader
 * then reads more, never less.
 *
 * @param agents - the agent files that parsed, in every hub
 * @returns the folders and names to pass as `leaveOut`
 * @throws KindedError `invalid_input` when a working folder is, holds or sits
 *   inside a place for definitions; the format refuses such a folder first,
 *   so this guards against a gap in it
 *
 * @example
 * leaveOutFor(agents); // { folders: ["repo"], names: ["node_modules"] }
 */
export function leaveOutFor(agents: readonly LoadedFileOf<"agent">[]): Required<LeaveOut> {
  const folders = harnessWorkingFoldersOf(agents);
  for (const folder of folders) {
    // Every definition sits under one of the top names, so a folder overlaps
    // one exactly when its first part is a top name: it then is that place,
    // holds it or sits inside it.
    const top = foldName(folder.split("/")[0] ?? "");
    if (definitionTops.has(top)) {
      throw new KindedError(
        "invalid_input",
        `the working folder ${folder} overlaps the workspace's definitions.`,
        { fix: "Give the agent a working folder outside the definition folders, such as files/." },
      );
    }
  }
  return { folders, names: leftOutNames };
}
