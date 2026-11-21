import { WorkspaceAgents, type WorkspaceAgentsParts } from "./workspace-agents.ts";

/** What the WorkspaceAgents tests share: a workspace of a few files, kept in memory. */

export const writerFile = "id: writer\nname: Writer\ndescription: Drafts replies.\nmodel: fast\n";
const replyFile =
  "id: reply\nname: Reply\ninitial: first\nstates:\n  first:\n    agent: writer\n    on:\n      - to: done\n  done:\n    type: final\n";

/** A `WorkspaceAgents` over an in-memory workspace with hubs `acme` and `beta`, with the changes it made. */
export function setup(
  extra: Pick<
    WorkspaceAgentsParts,
    "newAgents" | "liveness" | "answerChat" | "detectHarness" | "versionDialog"
  > = {},
) {
  const store: Record<string, string> = {
    "models.yaml":
      "aliases:\n  fast:\n    provider: anthropic\n    model: claude-haiku\n  smart:\n    provider: anthropic\n    model: claude-sonnet\n",
    "hubs/acme/hub.yaml": "id: acme\nname: Acme\n",
    "hubs/beta/hub.yaml": "id: beta\nname: Beta\n",
    "hubs/acme/agents/writer.agent.yaml": writerFile,
    "hubs/acme/workflows/reply.workflow.yaml": replyFile,
  };
  const changes: { label: string; changes: Record<string, string | null> }[] = [];
  const listeners = new Set<() => void>();
  // What each step replaced, so `undo` can put it back, as the kernel's files do.
  const undoable: Record<string, string | null>[] = [];
  let step = 0;
  const host = new WorkspaceAgents({
    ...extra,
    files: {
      read: async (path) => store[path] ?? null,
      list: async (dir) =>
        Object.keys(store)
          .filter((path) => path.startsWith(`${dir}/`))
          .sort(),
      change: (label, made) => {
        changes.push({ label, changes: made });
        undoable.push(
          Object.fromEntries(Object.keys(made).map((path) => [path, store[path] ?? null])),
        );
        step += 1;
        for (const [path, text] of Object.entries(made)) {
          if (text === null) delete store[path];
          else store[path] = text;
        }
        for (const listener of listeners) listener();
      },
      undo: () => {
        const before = undoable.pop();
        if (before === undefined) return false;
        for (const [path, text] of Object.entries(before)) {
          if (text === null) delete store[path];
          else store[path] = text;
        }
        step += 1;
        for (const listener of listeners) listener();
        return true;
      },
      get step() {
        return step;
      },
      // Each change here is saved at once.
      pending: {},
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  return { host, store, changes };
}
