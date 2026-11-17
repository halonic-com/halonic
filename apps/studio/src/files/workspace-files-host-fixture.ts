import { WorkspaceFilesHost } from "./workspace-files-host.ts";

export function setup(
  saved: string[] | Error,
  pending: Record<string, string | null> = {},
  more: Record<string, string> = {},
  outside: { held?: string[]; reloaded?: { path: string }[]; theirs?: string | null } = {},
) {
  const watching: {
    changed?: (changes: { path: string; kind: "changed" | "removed" }[]) => void;
    closed: number;
  } = { closed: 0 };
  const settled: string[] = [];
  const renames: { from: string; to: string; rewrites?: Record<string, string> }[] = [];
  const texts: Record<string, string> = { "workspace.yaml": "id: acme\nname: Acme\n", ...more };
  const listeners = new Set<() => void>();
  const changes: { label: string; changes: Record<string, string | null>; key?: string }[] = [];
  let current = pending;
  let step = 0;
  const undone: number[] = [];
  const host = new WorkspaceFilesHost({
    store: {
      list: async () => {
        if (saved instanceof Error) throw saved;
        return saved;
      },
      watch: async (listener) => {
        watching.changed = listener.changed;
        return {
          close: async () => {
            watching.closed++;
          },
        };
      },
    },
    files: {
      get pending() {
        return current;
      },
      get step() {
        return step;
      },
      undo: () => {
        undone.push(1);
        return true;
      },
      reloadFromOutside: async () => ({
        reloaded: outside.reloaded ?? [],
        held: outside.held ?? [],
      }),
      compare: async (path) => ({
        path,
        mine: "mine",
        theirs: outside.theirs === undefined ? "theirs" : outside.theirs,
        combined: null,
      }),
      rename: async (from, to, rewrites) => {
        renames.push({ from, to, ...(rewrites ? { rewrites } : {}) });
      },
      settle: async (path) => {
        settled.push(path);
      },
      read: async (path) => (path in pending ? (pending[path] ?? null) : (texts[path] ?? null)),
      list: async (dir) => Object.keys(texts).filter((path) => path.startsWith(`${dir}/`)),
      change: (label, made, options) => {
        current = { ...current };
        step++;
        changes.push({
          label,
          changes: made,
          ...(options?.coalesceKey ? { key: options.coalesceKey } : {}),
        });
      },
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  const save = () => {
    current = { ...current };
  };
  return { host, listeners, changes, watching, settled, renames, undone, save };
}
