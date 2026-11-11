import type { HubUses } from "@halonicjs/format";
import { err, ok, type Result } from "@halonicjs/std";
import { gitIgnorePath } from "./init-workspace.ts";
import { filesOf, type LoadedFileOf, type LoadedWorkspace } from "./load-workspace.ts";

/** Which part of the new workspace a file is, so a report can group them. */
export type ExtractPart =
  /** The hub's own folder, `hubs/<hub>/…`. */
  | "hub"
  /** A shared item the hub uses, with its skill folder or knowledge documents. */
  | "shared"
  /** What every workspace needs: models, providers, runtimes, the hub's workspace-level routines. */
  | "workspace";

/** One file the new workspace gets. It keeps its path: the layout is the same on both sides. */
export interface ExtractFile {
  readonly path: string;
  readonly part: ExtractPart;
}

/** The settings the new `workspace.yaml` takes from the hub; every other setting stays. */
export interface ExtractSettings {
  readonly id: string;
  readonly name: string;
  /** The hub's description; without one, the workspace's own is removed too. */
  readonly description?: string;
}

/** What `planHubExtract` works out: a new workspace holding one hub and what it uses. */
export interface ExtractPlan {
  /** The hub's id, which is its folder under `hubs/`. */
  readonly hub: string;
  /** The files to copy, sorted by path; `workspace.yaml` is not among them. */
  readonly files: readonly ExtractFile[];
  /** What `workspace.yaml` changes. */
  readonly settings: ExtractSettings;
  /** The shared items taken along, by kind, sorted. */
  readonly uses: HubUses;
}

/** Why a hub can't be extracted. */
export type ExtractError =
  /** No hub has this id; `hubs` lists the ones there are, sorted. */
  | { readonly kind: "unknown_hub"; readonly hub: string; readonly hubs: readonly string[] }
  /** The workspace has errors, so a copy would carry them, or miss what a broken file names. */
  | { readonly kind: "has_errors"; readonly errors: number };

/** The kinds of shared item a hub can use, with the key `uses` and an agent list them under. */
const sharedKinds = [
  { key: "connectors", kind: "connector" },
  { key: "skills", kind: "skill" },
  { key: "knowledge", kind: "knowledge" },
  { key: "collections", kind: "collection" },
] as const;

type SharedKind = (typeof sharedKinds)[number]["kind"];

/** Workspace files every hub needs to run: model aliases, providers and runtimes. */
const runFiles = /^(models\.yaml|providers\/[^/]+\.yaml|runtimes\/[^/]+\.yaml)$/;

/**
 * Plans a new workspace from one hub of a loaded workspace, so the hub can
 * move to a workspace of its own (the old `studio extract`). It reads
 * nothing and writes nothing: the plan is data, and `extractHub` writes it.
 *
 * The new workspace gets:
 * - the hub's own folder, `hubs/<hub>/…`, every file in it;
 * - `models.yaml`, the providers and the runtimes;
 * - the shared items the hub uses: those listed in its `uses`, and those its
 *   agents name and its routines watch that aren't its own, with a skill's
 *   whole folder, a `files` knowledge source's documents and the
 *   collections a copied collection refers to;
 * - the workspace-level routines that run in the hub, and the `.gitignore`;
 * - a `workspace.yaml` with the hub's id, name and description, and every
 *   other setting of the original, such as `privacy.localOnly`.
 *
 * `deployments.yaml` stays behind: it says where this workspace runs, not
 * what the hub is. So do the other hubs and the root's own agents and
 * workflows. The original workspace is not changed.
 *
 * @param workspace - the workspace as `loadWorkspace` gave it
 * @param hubId - the hub to take out, the name of its folder under `hubs/`
 * @returns the plan, or why there is none: an unknown hub, or a workspace with errors
 *
 * @example
 * const plan = planHubExtract(await loadWorkspace(source), "family");
 * if (plan.ok) console.log(plan.value.files.map((file) => file.path));
 */
export function planHubExtract(
  workspace: LoadedWorkspace,
  hubId: string,
): Result<ExtractPlan, ExtractError> {
  const hubs = hubsOf(workspace);
  if (!hubs.includes(hubId)) {
    return err({ kind: "unknown_hub", hub: hubId, hubs });
  }
  const errors = workspace.issues.filter((issue) => issue.severity === "error").length;
  if (errors > 0) {
    return err({ kind: "has_errors", errors });
  }

  const uses = sharedItemsUsed(workspace, hubId);
  const files: ExtractFile[] = [];
  const add = (path: string, part: ExtractPart) => {
    if (!files.some((file) => file.path === path)) {
      files.push({ path, part });
    }
  };

  const allPaths = [...workspace.files.map((file) => file.path), ...workspace.ignored];
  for (const path of allPaths) {
    if (path.startsWith(`hubs/${hubId}/`)) {
      add(path, "hub");
    } else if (runFiles.test(path) || path === gitIgnorePath) {
      add(path, "workspace");
    }
  }
  for (const routine of workspaceRoutinesOf(workspace, hubId)) {
    add(routine.path, "workspace");
  }
  for (const path of sharedPaths(workspace, uses, allPaths)) {
    add(path, "shared");
  }
  // A files knowledge source's documents can sit anywhere, also in the hub's own folder.
  for (const source of filesOf(workspace, "knowledge").filter((file) => file.hub === hubId)) {
    for (const path of documentsOf(source, allPaths)) {
      add(path, "hub");
    }
  }

  const hub = filesOf(workspace, "hub").find((file) => file.hub === hubId)?.value;
  const description = hub?.description;
  return ok({
    hub: hubId,
    files: files.sort((a, b) => compareText(a.path, b.path)),
    settings: {
      id: hubId,
      name: hub?.name ?? hubId,
      ...(description === undefined ? {} : { description }),
    },
    uses,
  });
}

/** The hubs of a workspace, by folder, sorted. */
function hubsOf(workspace: LoadedWorkspace): string[] {
  const hubs = new Set<string>();
  for (const file of workspace.files) {
    if (file.hub !== null) {
      hubs.add(file.hub);
    }
  }
  return [...hubs].sort(compareText);
}

/** Routines at the workspace root that run in the hub (`run.hub`). */
function workspaceRoutinesOf(workspace: LoadedWorkspace, hubId: string) {
  return filesOf(workspace, "routine").filter(
    (routine) => routine.hub === null && routine.value.run.hub === hubId,
  );
}

/**
 * The shared items the hub uses, by kind: those its `uses` lists, and those
 * its agents name and its routines watch that aren't its own, then the
 * collections a taken collection refers to. Only items the root has count.
 */
function sharedItemsUsed(workspace: LoadedWorkspace, hubId: string): HubUses {
  const shared = (kind: SharedKind) => idsOf(workspace, kind, null);
  const own = (kind: SharedKind) => idsOf(workspace, kind, hubId);
  const listed = filesOf(workspace, "hub").find((file) => file.hub === hubId)?.value.uses;
  const agents = filesOf(workspace, "agent").filter((agent) => agent.hub === hubId);

  const uses = {} as Record<keyof HubUses, Set<string>>;
  for (const { key, kind } of sharedKinds) {
    const named = [...(listed?.[key] ?? []), ...agents.flatMap((agent) => agent.value[key])];
    uses[key] = new Set(named.filter((id) => shared(kind).has(id) && !own(kind).has(id)));
  }
  for (const id of mailConnectorsOf(workspace, hubId)) {
    if (shared("connector").has(id) && !own("connector").has(id)) {
      uses.connectors.add(id);
    }
  }
  addReferredCollections(workspace, uses.collections);

  return {
    connectors: [...uses.connectors].sort(compareText),
    skills: [...uses.skills].sort(compareText),
    knowledge: [...uses.knowledge].sort(compareText),
    collections: [...uses.collections].sort(compareText),
  };
}

/** The connectors the hub's routines, its own and the root's that run in it, watch for mail. */
function mailConnectorsOf(workspace: LoadedWorkspace, hubId: string): string[] {
  const routines = [
    ...filesOf(workspace, "routine").filter((routine) => routine.hub === hubId),
    ...workspaceRoutinesOf(workspace, hubId),
  ];
  return routines.flatMap((routine) => {
    const trigger = routine.value.trigger;
    return "mail" in trigger ? [trigger.mail.connector] : [];
  });
}

/** Adds the collections that the taken ones refer to in a `ref` field, and theirs, to `taken`. */
function addReferredCollections(workspace: LoadedWorkspace, taken: Set<string>): void {
  const collections = filesOf(workspace, "collection");
  const waiting = [...taken];
  for (let id = waiting.pop(); id !== undefined; id = waiting.pop()) {
    const collection = collections.find((file) => file.value.id === id);
    for (const field of Object.values(collection?.value.fields ?? {})) {
      const referred = field.collection;
      if (referred !== undefined && !taken.has(referred)) {
        taken.add(referred);
        waiting.push(referred);
      }
    }
  }
}

/** The paths of the shared items taken: their files, skill folders and knowledge documents. */
function sharedPaths(
  workspace: LoadedWorkspace,
  uses: HubUses,
  allPaths: readonly string[],
): string[] {
  const paths: string[] = [];
  for (const { key, kind } of sharedKinds) {
    const taken = new Set(uses[key]);
    for (const file of workspace.files) {
      if (file.kind !== kind || file.hub !== null || !taken.has(file.value.id)) {
        continue;
      }
      paths.push(file.path);
      if (file.kind === "skill") {
        const folder = file.path.slice(0, file.path.lastIndexOf("/") + 1);
        paths.push(...allPaths.filter((path) => path.startsWith(folder)));
      }
      if (file.kind === "knowledge") {
        paths.push(...documentsOf(file, allPaths));
      }
    }
  }
  return paths;
}

/**
 * The documents of a `files` knowledge source: the workspace's files under
 * its `config.path`, which is relative to the workspace root. A path that
 * is absolute or leaves the workspace gives none.
 */
function documentsOf(source: LoadedFileOf<"knowledge">, allPaths: readonly string[]): string[] {
  const folder = source.value.config["path"];
  if (source.value.provider !== "files" || typeof folder !== "string" || isAbsolute(folder)) {
    return [];
  }
  const parts = folder.split(/[\\/]+/).filter((part) => part !== "" && part !== ".");
  if (parts.length === 0 || parts.includes("..")) {
    return [];
  }
  const prefix = `${parts.join("/")}/`;
  return allPaths.filter((path) => path.startsWith(prefix));
}

/** Whether a path starts at a root, `/` or `\`, or at a drive, such as `C:`. */
function isAbsolute(path: string): boolean {
  return /^([\\/]|[a-zA-Z]:)/.test(path);
}

/** The ids of one kind's files in one hub (`null`: the root). */
function idsOf(workspace: LoadedWorkspace, kind: SharedKind, hub: string | null): Set<string> {
  return new Set(
    filesOf(workspace, kind)
      .filter((file) => file.hub === hub)
      .map((file) => file.value.id),
  );
}

/** Compares paths and ids by code unit, as a source lists them; no two are the same. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : 1;
}
