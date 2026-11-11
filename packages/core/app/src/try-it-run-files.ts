// Which workspace files one item's Try it run reads (HAL-3277), so Try it
// counts only the left-out changes that matter to that run, and names the
// steps a left-out change breaks.

import type { KindName } from "@halonicjs/format";
import { type LoadedFile, type LoadedWorkspace, placeOf } from "@halonicjs/workspace";

/** The files a run reads, all together and for each step of a workflow. */
export interface RunFiles {
  /** Every file the run reads: the item, what it calls and names, and the settings. */
  readonly all: ReadonlySet<string>;
  /** For a workflow, the files each step reads, by step id; empty for an agent. */
  readonly byStep: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * The model names the run may use: its agents' and their methods', the
   * hub's and the workspace's default, and the aliases those fall back to,
   * all the way down. It may hold more than the run uses, never less.
   */
  readonly models: ReadonlySet<string>;
}

/** The kinds every run reads, whatever it calls. */
const settingsKinds: readonly KindName[] = ["workspace", "models", "provider", "runtime"];

/** The library kinds an agent names, each with the agent's key for its list. */
const libraryKeys = [
  { key: "connectors", kind: "connector" },
  { key: "knowledge", kind: "knowledge" },
  { key: "skills", kind: "skill" },
  { key: "collections", kind: "collection" },
] as const;

/**
 * The files a Try it run of `item` reads, looked up in each of
 * `workspaces`: the workspace as it is and as Try it reads it, so a file
 * either one has counts. From a workflow, it follows each step's agents and
 * child workflows; from an agent, its subagents and the library items it
 * names, in its hub first, then at the root. It adds the workspace
 * settings, models, providers and runtimes, and the item's `hub.yaml`.
 *
 * @param item - the path of the workflow or agent being tried
 */
export function runFilesOf(workspaces: readonly LoadedWorkspace[], item: string): RunFiles {
  const files = new WorkspaceFiles(workspaces);
  const hub = placeOf(item)?.hub ?? null;
  const settings = workspaces.flatMap((workspace) =>
    workspace.files
      .filter(
        (file) => settingsKinds.includes(file.kind) || (file.kind === "hub" && file.hub === hub),
      )
      .map((file) => file.path),
  );
  const byStep = new Map<string, ReadonlySet<string>>();
  for (const [step, calls] of stepCalls(files.at(item))) {
    byStep.set(step, files.reach(calls, hub));
  }
  const all = new Set([...files.reach([item], hub), ...settings]);
  return { all, byStep, models: modelsOf(workspaces, all) };
}

/**
 * The model names a run reading the files `all` may use, see
 * {@link RunFiles.models}. `default` is always among them: it is the
 * workspace's default model when `workspace.yaml` doesn't parse.
 */
function modelsOf(workspaces: readonly LoadedWorkspace[], all: ReadonlySet<string>): Set<string> {
  const read = workspaces
    .flatMap((workspace) => workspace.files)
    .filter((file) => all.has(file.path));
  const names = new Set(["default"]);
  const add = (name: string | undefined) => {
    if (name !== undefined) {
      names.add(name);
    }
  };
  const fallbacks = new Map<string, string[]>();
  const addFallbacks = (aliases: Record<string, { readonly fallback: readonly string[] }>) => {
    for (const [name, alias] of Object.entries(aliases)) {
      fallbacks.set(name, [...(fallbacks.get(name) ?? []), ...alias.fallback]);
    }
  };
  for (const file of read) {
    switch (file.kind) {
      case "agent":
        add(file.value.model);
        for (const method of Object.values(file.value.methods)) {
          add(method.model);
        }
        break;
      case "hub":
        add(file.value.defaults.model);
        addFallbacks(file.value.models);
        break;
      case "workspace":
        add(file.value.defaults.model);
        break;
      case "models":
        addFallbacks(file.value.aliases);
        break;
    }
  }
  // Each name's fallbacks, then theirs, until none are new.
  for (const name of names) {
    for (const next of fallbacks.get(name) ?? []) {
      names.add(next);
    }
  }
  return names;
}

/** What one reference names: a file of `kind` with `id`, in the referring file's hub or at the root. */
interface Reference {
  readonly kind: "agent" | "workflow" | "connector" | "knowledge" | "skill" | "collection";
  readonly id: string;
}

/** The loaded files of several workspaces, found by path or by kind, hub and id. */
class WorkspaceFiles {
  readonly #byPath = new Map<string, LoadedFile[]>();

  constructor(workspaces: readonly LoadedWorkspace[]) {
    for (const file of workspaces.flatMap((workspace) => workspace.files)) {
      this.#byPath.set(file.path, [...(this.#byPath.get(file.path) ?? []), file]);
    }
  }

  /** Each workspace's version of the file at `path`. */
  at(path: string): readonly LoadedFile[] {
    return this.#byPath.get(path) ?? [];
  }

  /**
   * The paths reached from `start`: those paths, and every file they name,
   * then what those name, and so on. A path or reference that is in no
   * workspace is kept as it is, or left out when it names nothing.
   */
  reach(start: readonly string[] | readonly Reference[], hub: string | null): Set<string> {
    const reached = new Set<string>();
    const queue: string[] = start.flatMap((entry) =>
      typeof entry === "string" ? [entry] : this.#find(entry, hub),
    );
    for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
      if (reached.has(path)) {
        continue;
      }
      reached.add(path);
      for (const file of this.at(path)) {
        queue.push(...referencesOf(file).flatMap((reference) => this.#find(reference, file.hub)));
      }
    }
    return reached;
  }

  /** The paths of the files a reference names: in its hub first, at the root when there are none. */
  #find(reference: Reference, hub: string | null): string[] {
    const matching = (inHub: string | null) =>
      [...this.#byPath.values()]
        .flat()
        .filter(
          (file) =>
            file.kind === reference.kind && file.hub === inHub && file.value.id === reference.id,
        )
        .map((file) => file.path);
    const own = matching(hub);
    // Agents and workflows are the hub's own; library items may be shared from the root.
    const local = reference.kind === "agent" || reference.kind === "workflow";
    return own.length > 0 || local || hub === null ? unique(own) : unique(matching(null));
  }
}

/** What one file names in others. */
function referencesOf(file: LoadedFile): Reference[] {
  switch (file.kind) {
    case "workflow":
      return [...stepCalls([file]).values()].flat();
    case "agent":
      return [
        ...file.value.subagents.map((id) => ({ kind: "agent" as const, id })),
        ...libraryKeys.flatMap(({ key, kind }) => file.value[key].map((id) => ({ kind, id }))),
      ];
    default:
      return [];
  }
}

/** What each step of the workflow versions in `files` calls, by step id. */
function stepCalls(files: readonly LoadedFile[]): Map<string, Reference[]> {
  const calls = new Map<string, Reference[]>();
  for (const file of files) {
    if (file.kind !== "workflow") {
      continue;
    }
    for (const [step, state] of Object.entries(file.value.states)) {
      const references: Reference[] = [
        ...(state.agent === undefined ? [] : [{ kind: "agent" as const, id: state.agent }]),
        ...Object.values(state.branches ?? {}).map((branch) => ({
          kind: "agent" as const,
          id: branch.agent,
        })),
        ...(state.workflow === undefined
          ? []
          : [{ kind: "workflow" as const, id: state.workflow }]),
      ];
      calls.set(step, [...(calls.get(step) ?? []), ...references]);
    }
  }
  return calls;
}

function unique(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}
