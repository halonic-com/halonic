import type { DefinitionSource, DefinitionStore } from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";
import { editYaml, type YamlEdit } from "@halonicjs/yaml";
import { copyWorkspace } from "./copy-workspace.ts";
import {
  type ExtractError,
  type ExtractPlan,
  type ExtractSettings,
  planHubExtract,
} from "./extract-plan.ts";
import { gitIgnorePath } from "./init-workspace.ts";
import type { LoadedWorkspace } from "./load-workspace.ts";
import { settingsPath } from "./places.ts";

/** A new workspace `extractHub` laid out, or would lay out on a dry run. */
export interface ExtractedHub {
  readonly plan: ExtractPlan;
  /** The target store's location, such as "./family". */
  readonly location: string;
  /**
   * The workspace-relative paths written, in the order they were written:
   * the plan's files, a new `.gitignore` when the source has none, and
   * `workspace.yaml` last. On a dry run, the ones that would be.
   */
  readonly files: readonly string[];
}

/** Why `extractHub` wrote nothing. */
export type ExtractHubError =
  | ExtractError
  /** The target already has files, and is left as it is. */
  | { readonly kind: "not_empty"; readonly location: string };

/** Whether `extractHub` only works out what it would write. */
export interface ExtractHubOptions {
  readonly dryRun?: boolean;
}

/**
 * Takes one hub out of a workspace into a new one in an empty `target`, as
 * {@link planHubExtract} plans it. The writing is `copyWorkspace`'s: it
 * never writes into a store that lists a file, writes `workspace.yaml` last
 * and removes what it wrote when a write fails. The new `workspace.yaml` is
 * the original with the hub's id, name and description put in, so its
 * comments and the rest of its settings stay as they were.
 *
 * @param workspace - the loaded workspace, as `loadWorkspace` gave it from `source`
 * @param source - the same workspace's files, to read the planned ones from
 * @param target - an empty store, or one for a folder that doesn't exist yet
 * @param hubId - the hub to take out
 * @param options - `dryRun` to only check the target and say what would be written
 * @returns the plan and the files written, or why nothing was
 *
 * @example
 * const source = new FolderDefinitionStore("home");
 * const result = await extractHub(await loadWorkspace(source), source, new FolderDefinitionStore("family"), "family");
 */
export async function extractHub(
  workspace: LoadedWorkspace,
  source: DefinitionSource,
  target: DefinitionStore,
  hubId: string,
  options: ExtractHubOptions = {},
): Promise<Result<ExtractedHub, ExtractHubError>> {
  const planned = planHubExtract(workspace, hubId);
  if (!planned.ok) {
    return planned;
  }
  const plan = planned.value;
  if (options.dryRun === true) {
    if ((await target.list()).length > 0) {
      return err({ kind: "not_empty", location: target.location });
    }
    return ok({ plan, location: target.location, files: filesToWrite(plan) });
  }
  const settings = await newSettings(source, plan.settings);
  const copied = await copyWorkspace(new PlannedSource(source, plan, settings), target);
  if (!copied.ok) {
    return copied;
  }
  return ok({ plan, location: target.location, files: copied.value.files });
}

/**
 * The paths a write of the plan gives, in `copyWorkspace`'s order: the
 * `.gitignore` first, the source's or a new one, then the plan's files, then
 * `workspace.yaml`.
 */
function filesToWrite(plan: ExtractPlan): string[] {
  const others = plan.files.map((file) => file.path).filter((path) => path !== gitIgnorePath);
  return [gitIgnorePath, ...others, settingsPath];
}

/** The original `workspace.yaml` with the hub's id, name and description put in. */
async function newSettings(source: DefinitionSource, settings: ExtractSettings): Promise<string> {
  const text = (await source.read(settingsPath)) ?? "";
  const edits: YamlEdit[] = [
    { kind: "set", path: ["id"], value: settings.id },
    { kind: "set", path: ["name"], value: settings.name },
    settings.description === undefined
      ? { kind: "delete", path: ["description"] }
      : { kind: "set", path: ["description"], value: settings.description, after: "name" },
  ];
  const edited = editYaml(text, edits);
  if (!edited.ok) {
    // The workspace loaded without errors, so its workspace.yaml reads; this is a bug.
    throw new Error(`workspace.yaml can't be edited: ${edited.error.message}`);
  }
  return edited.value.text;
}

/**
 * The planned files of a source, and the new `workspace.yaml`: what
 * `copyWorkspace` copies. It lists only those, and `copyWorkspace` reads only
 * what is listed.
 */
class PlannedSource implements DefinitionSource {
  readonly location: string;
  private readonly paths: readonly string[];

  private readonly source: DefinitionSource;
  private readonly settings: string;

  constructor(source: DefinitionSource, plan: ExtractPlan, settings: string) {
    this.location = source.location;
    this.source = source;
    this.settings = settings;
    // Sorted by code unit, as a source lists its files.
    this.paths = [...plan.files.map((file) => file.path), settingsPath].sort();
  }

  async list(): Promise<string[]> {
    return [...this.paths];
  }

  async read(path: string): Promise<string | null> {
    if (path === settingsPath) {
      return this.settings;
    }
    return await this.source.read(path);
  }

  async version(): Promise<string> {
    return await this.source.version();
  }
}
