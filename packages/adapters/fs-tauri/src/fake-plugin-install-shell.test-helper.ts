import { decodeBase64url } from "@halonicjs/std";
import { FakeFolderShell, type FolderTree } from "./fake-folder-shell.test-helper.ts";
import type { ShellCall } from "./fake-shell.test-helper.ts";
import type { PluginInstallRefusalKind } from "./plugin-install-commands.ts";
import type { TauriShell } from "./shell.ts";

/** A commit the fake shell can export for a git address. */
export interface FakeRepository {
  readonly tree: FolderTree;
  readonly commit: string;
  readonly branch: string | null;
}

/**
 * A shell that answers the plugin install commands the way the Rust shell
 * does, written out on its own rather than from the adapter: a folder the
 * person picks, folders it reads only by the location a pick or an export
 * answered (any other is `source_not_picked`), a `plugin_folder_place` that
 * answers `taken` for a name in use in any case and never overwrites, and an
 * export that can be held open, so a test can end it while it runs. Reading
 * is the `folder_*` fake over the source's tree.
 *
 * Every call is kept in `calls`; `placed` holds each placed plugin's files,
 * `ended` each token `plugin_git_export_end` was given, and `kept` the
 * locations of the exports that are still there.
 */
export class FakePluginInstallShell implements TauriShell {
  readonly calls: ShellCall[] = [];
  /** The plugins placed, by name, with each file's text. */
  readonly placed = new Map<string, Map<string, string>>();
  /** Every token `plugin_git_export_end` was given, in order. */
  readonly ended: string[] = [];
  readonly #sources = new Map<string, FakeFolderShell>();
  readonly #picks: (string | null)[];
  readonly #repositories: Readonly<Record<string, FakeRepository>>;
  readonly #granted: boolean;
  readonly #hold: (() => Promise<void>) | undefined;
  readonly #loseEnds: boolean;
  #holding = false;

  /**
   * @param options.sources - the folders the person can pick, by location
   * @param options.picks - what the picker answers on each call, `null` for a cancel
   * @param options.installed - plugin names already in the plugins folder
   * @param options.repositories - what each git address exports
   * @param options.hold - makes an export wait here before it answers
   * @param options.loseEndsWhileHeld - drops an end that comes while an export is held, as when it is handled before the export is known
   * @param options.granted - whether the page has the capabilities
   */
  constructor(
    options: {
      sources?: Readonly<Record<string, FolderTree>>;
      picks?: (string | null)[];
      installed?: readonly string[];
      repositories?: Readonly<Record<string, FakeRepository>>;
      hold?: () => Promise<void>;
      loseEndsWhileHeld?: boolean;
      granted?: boolean;
    } = {},
  ) {
    for (const [location, tree] of Object.entries(options.sources ?? {})) {
      this.#sources.set(location, new FakeFolderShell({ opened: location, tree }));
    }
    this.#picks = [...(options.picks ?? [])];
    for (const name of options.installed ?? []) this.placed.set(name, new Map());
    this.#repositories = options.repositories ?? {};
    this.#hold = options.hold;
    this.#loseEnds = options.loseEndsWhileHeld ?? false;
    this.#granted = options.granted ?? true;
  }

  /** The locations of the exports that are still kept. */
  get kept(): string[] {
    return [...this.#sources.keys()].filter((location) => location.startsWith("export:"));
  }

  async invoke(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
    this.calls.push({ command, args: structuredClone(args) });
    if (!this.#granted) throw `Command ${command} not allowed by ACL`;
    switch (command) {
      case "plugin_source_pick":
        return this.#picks.shift() ?? null;
      case "plugin_source_entries":
        return await this.#reader(args["source"]).invoke("folder_entries", {
          workspace: args["source"],
          dir: args["dir"],
          limit: args["limit"],
          recursive: args["recursive"],
        });
      case "plugin_source_read":
        return await this.#reader(args["source"]).invoke("folder_read", {
          workspace: args["source"],
          path: args["path"],
        });
      case "plugin_folder_place":
        return this.#place(args);
      case "plugin_git_export":
        return await this.#export(args);
      case "plugin_git_export_end":
        if (this.#holding && this.#loseEnds) return null;
        this.ended.push(String(args["token"]));
        this.#sources.delete(`export:${String(args["token"])}`);
        return null;
      default:
        throw `Command ${command} not found`;
    }
  }

  #reader(source: unknown): FakeFolderShell {
    const reader = this.#sources.get(String(source));
    if (reader === undefined) {
      throw refusal(
        "source_not_picked",
        "A plugin can only be added from a folder chosen with Choose folder.",
      );
    }
    return reader;
  }

  #place(args: Record<string, unknown>): "placed" | "taken" {
    const plugin = String(args["plugin"]);
    const files = args["files"] as { path: string; bytes: string }[];
    const same = [...this.placed.keys()].find(
      (name) => name.toLowerCase() === plugin.toLowerCase(),
    );
    if (same !== undefined && (args["replace"] !== true || same !== plugin)) return "taken";
    const text = new TextDecoder();
    this.placed.set(
      plugin,
      new Map(files.map((file) => [file.path, text.decode(decodeBase64url(file.bytes))])),
    );
    return "placed";
  }

  async #export(args: Record<string, unknown>): Promise<unknown> {
    const address = String(args["address"]);
    const token = String(args["token"]);
    const repository = this.#repositories[address];
    if (repository === undefined) {
      throw refusal("export_failed", "couldn't reach the repository: Could not resolve host");
    }
    this.#holding = true;
    try {
      await this.#hold?.();
    } finally {
      this.#holding = false;
    }
    if (this.ended.includes(token)) throw refusal("cancelled", "the export was stopped");
    const location = `export:${token}`;
    this.#sources.set(location, new FakeFolderShell({ opened: location, tree: repository.tree }));
    return { location, commit: repository.commit, branch: repository.branch };
  }
}

function refusal(kind: PluginInstallRefusalKind, message: string): unknown {
  return { kind, message };
}
