import type { SnapshotInput } from "@halonicjs/format";
import { filesOf, type LoadedWorkspace } from "./load-workspace.ts";

/**
 * What a workspace commit's snapshot is made from: the workspace's name, its
 * tool, template and signal files and its `routing.yaml`, all at the
 * workspace root. Without a `routing.yaml` the input has no routing, so the
 * plugin keeps its own defaults. The plugin
 * builder passes this to `makeSnapshot`, so it never lists a workspace's
 * files itself.
 *
 * @param workspace - the loaded workspace
 * @param commit - the git commit the files were read at
 * @returns the snapshot's input; `makeSnapshot` sorts and checks it
 *
 * @example
 * makeSnapshot(snapshotInputOf(await loadWorkspace(source), commit));
 */
export function snapshotInputOf(workspace: LoadedWorkspace, commit: string): SnapshotInput {
  const settings = filesOf(workspace, "workspace")[0]?.value;
  const routing = filesOf(workspace, "routing")[0]?.value;
  return {
    name: settings?.name ?? "",
    commit,
    tools: filesOf(workspace, "tool").map((file) => file.value),
    templates: filesOf(workspace, "template").map((file) => file.value),
    signals: filesOf(workspace, "signal").map((file) => file.value),
    ...(routing === undefined ? {} : { routing }),
  };
}
