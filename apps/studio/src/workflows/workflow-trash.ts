import { KindedError } from "@halonicjs/std";
import type {
  TrashedWorkflow,
  WorkflowRef,
  WorkflowUsers,
} from "@halonicjs/studio-feature-workflows/api";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import type { WorkspaceWorkflowsParts } from "./workspace-workflows-parts.ts";

/** The workflow's display name and the files its delete moves to the trash. */
interface WorkflowFiles {
  readonly name: string;
  /** The workflow's file first, then its test files. */
  readonly paths: readonly string[];
}

/**
 * The files of the workflow `ref` that go to the trash together: its own and every test file of the
 * hub that tests it, since a test of a workflow that isn't there can't run. `undefined` when the hub
 * has no such workflow.
 */
export function workflowFilesOf(
  workspace: LoadedWorkspace,
  { hubId, id }: WorkflowRef,
): WorkflowFiles | undefined {
  const file = filesOf(workspace, "workflow").find(
    (one) => one.hub === hubId && one.value.id === id,
  );
  if (file === undefined) return undefined;
  const tests = filesOf(workspace, "workflowTest")
    .filter((one) => one.hub === hubId && one.value.workflow === id)
    .map((one) => one.path);
  return { name: file.value.name, paths: [file.path, ...tests] };
}

/**
 * What runs the workflow `ref`: the routines that start it (a routine that names no hub starts its
 * own hub's), and the steps of its hub's other workflows that name it, as a `workflow` or a
 * `foreach` step does. Its own steps go with it, so they don't count.
 */
export function workflowUsersOf(
  workspace: LoadedWorkspace,
  { hubId, id }: WorkflowRef,
): WorkflowUsers {
  const routines = filesOf(workspace, "routine").filter(({ hub, value: { run } }) => {
    return "workflow" in run && run.workflow === id && (run.hub ?? hub) === hubId;
  }).length;
  const steps = filesOf(workspace, "workflow")
    .filter((one) => one.hub === hubId && one.value.id !== id)
    .flatMap((one) => Object.values(one.value.states))
    .filter((state) => state.workflow === id).length;
  return { routines, steps };
}

/**
 * Moves the workflow's files to the trash as one change. Undo is the workspace's undo, so it puts
 * them back only while the delete is still the newest step: after any other change it rejects and
 * undoes nothing.
 */
export function trashWorkflowFiles(
  files: WorkspaceWorkflowsParts["files"],
  { name, paths }: WorkflowFiles,
): TrashedWorkflow {
  files.change(`Deleted workflow ${name}`, Object.fromEntries(paths.map((path) => [path, null])));
  const afterDelete = files.step;
  return {
    undo: async () => {
      if (files.step !== afterDelete || !files.undo()) {
        throw new KindedError(
          "conflict",
          `${name} can't be put back, because the workspace changed after it was deleted.`,
        );
      }
    },
  };
}
