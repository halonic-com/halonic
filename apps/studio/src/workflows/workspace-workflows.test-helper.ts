import type { RunEvent, RunSummary } from "@halonicjs/events";
import { WorkspaceWorkflows } from "./workspace-workflows.ts";
import type { WorkspaceWorkflowsParts } from "./workspace-workflows-parts.ts";

/** Acme's workflow `reply`: one final step. */
export const replyFile =
  "id: reply\nname: Reply\ninitial: first\nstates:\n  first:\n    type: final\n";

/**
 * A {@link WorkspaceWorkflows} over files in memory, with the hubs acme and beta and acme's
 * `reply`: the store, the changes it was asked for, and the listeners it registered.
 */
export function setup(
  runs: Partial<RunSummary>[] = [],
  logs: Record<string, RunEvent[]> = {},
  engine?: WorkspaceWorkflowsParts["engine"],
  settle?: WorkspaceWorkflowsParts["settle"],
) {
  const store: Record<string, string> = {
    "hubs/acme/hub.yaml": "id: acme\nname: Acme\n",
    "hubs/beta/hub.yaml": "id: beta\nname: Beta\n",
    "hubs/acme/workflows/reply.workflow.yaml": replyFile,
  };
  const changes: { label: string; changes: Record<string, string | null> }[] = [];
  // What each change replaced, newest last, for the workspace's undo.
  const undoable: Record<string, string | undefined>[] = [];
  // The workspace's step, which every change and undo moves on.
  let step = 0;
  const fileListeners = new Set<() => void>();
  const runListeners = new Set<() => void>();
  const put = (made: Record<string, string | null>) => {
    for (const [path, text] of Object.entries(made)) {
      if (text === null) delete store[path];
      else store[path] = text;
    }
  };
  const host = new WorkspaceWorkflows({
    files: {
      read: async (path) => store[path] ?? null,
      list: async (dir) =>
        Object.keys(store)
          .filter((path) => path.startsWith(`${dir}/`))
          .sort(),
      change: (label, made) => {
        changes.push({ label, changes: made });
        step += 1;
        undoable.push(Object.fromEntries(Object.keys(made).map((path) => [path, store[path]])));
        put(made);
      },
      undo: () => {
        const before = undoable.pop();
        if (before === undefined) return false;
        step += 1;
        put(Object.fromEntries(Object.entries(before).map(([path, text]) => [path, text ?? null])));
        return true;
      },
      get step() {
        return step;
      },
    },
    onChange: (listener) => {
      fileListeners.add(listener);
      return () => fileListeners.delete(listener);
    },
    runs: {
      list: async () => runs.map((summary) => ({ summary: summary as RunSummary })),
      subscribe: (listener) => {
        runListeners.add(listener);
        return () => runListeners.delete(listener);
      },
      log: async (runId) => logs[runId] ?? [],
    },
    ...(engine === undefined ? {} : { engine }),
    ...(settle === undefined ? {} : { settle }),
  });
  return { store, changes, fileListeners, runListeners, host };
}
