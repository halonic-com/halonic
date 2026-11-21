import type {
  TrashedWorkflow,
  WorkflowRef,
  WorkflowUsers,
} from "@halonicjs/studio-feature-workflows/api";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { deleteWithUndo } from "../files/undoable-delete.ts";
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
 * own hub's), and the `workflow` and `foreach` steps of its hub's other workflows that name it: the
 * engine ignores `workflow` on any other step. Its own steps go with it, so they don't count.
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
    .filter((state) => runsAWorkflow(state.type) && state.workflow === id).length;
  return { routines, steps };
}

/** Whether a step of this kind runs the workflow it names: other kinds ignore `workflow`. */
function runsAWorkflow(type: string | undefined): boolean {
  return type === "workflow" || type === "foreach";
}

/**
 * Moves the workflow's files to the trash as one change, with the way back of
 * {@link deleteWithUndo}: it puts them back after later changes too, unless a file has taken
 * their place.
 */
export async function trashWorkflowFiles(
  files: WorkspaceWorkflowsParts["files"],
  { name, paths }: WorkflowFiles,
): Promise<TrashedWorkflow> {
  return deleteWithUndo(files, { paths, what: `workflow ${name}`, name });
}
