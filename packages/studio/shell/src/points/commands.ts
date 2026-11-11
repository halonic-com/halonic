import type { WorkspaceContext } from "../workspace-context.ts";
import type { ItemRef } from "./item-kinds.ts";
import type { Ordered } from "./point-store.ts";

/** A command people can run from the palette, a menu or a shortcut. Ids are unique. */
export interface CommandContribution {
  /** Unique, such as `agents.new`. */
  readonly id: string;
  readonly title: string;
  /**
   * Where the command comes from when that isn't Halonic, such as "Weather plugin". The palette
   * shows it beside the title and reads it after the title, so the title never has to say it.
   */
  readonly source?: string;
  run(context: WorkspaceContext): void | Promise<void>;
}

/**
 * Commands that come and go while Studio runs, such as those of the plugins that are on. The
 * shell asks for them each time it lists commands, as when the palette opens.
 *
 * @example
 * studio.commands.addSource({ id: "plugins.commands", commands: () => commandsOfPluginsThatAreOn() });
 */
export interface CommandSource {
  /**
   * Unique among sources, such as `plugins.commands`. Every command it gives has an id that
   * starts with this one and a dot, such as `plugins.commands.weather.forecast`.
   */
  readonly id: string;
  /**
   * Its commands right now. A command whose id doesn't start with the source's id, isn't a
   * valid id or repeats one is left out, and so is every command of a source that throws, so
   * one broken source never takes the palette down.
   */
  commands(): readonly CommandContribution[];
}

/**
 * A shortcut for a command, possibly only in a context.
 *
 * @example
 * studio.keybindings.add({ command: "codeEditor.undo", keys: "Ctrl+Z", when: "codeEditorFocused" });
 */
export interface KeybindingContribution {
  /** The id of a command; any feature's. */
  readonly command: string;
  /**
   * Modifiers and one key joined by `+`, such as `Ctrl+Alt+A`. Case and
   * modifier order don't matter. `Cmd` is `Meta`; `Mod` is `Cmd` on macOS and
   * `Ctrl` elsewhere. A trailing `+` is the plus key, as in `Ctrl++`. Shift
   * counts as written: `Ctrl++` matches a press the host sends as `Ctrl++`,
   * not `Ctrl+Shift++`, which is what a US keyboard gives, since `+` needs Shift there.
   */
  readonly keys: string;
  /**
   * The contexts that must hold: names joined by `&&`, each optionally
   * negated with `!`, such as `workspaceFocused && !codeEditorFocused`.
   * Leave it out for a shortcut that applies everywhere.
   */
  readonly when?: string;
}

/** One search hit: an item and how to show it. */
export interface SearchResult {
  readonly item: ItemRef;
  readonly label: string;
  /** The kind and hub, such as "Agent · acme". */
  readonly detail?: string;
  /** The item's description, which the Search page also searches and shows under the name. */
  readonly description?: string;
}

/** Offers a feature's items to search. Ids are unique. */
export interface SearchProviderContribution extends Ordered {
  readonly title: string;
  search(query: string, context: WorkspaceContext): Promise<readonly SearchResult[]>;
}

/** A feature's UI state while one workspace is open. */
export interface PersistedSession {
  /** The state to keep; plain data the shell can write as JSON. */
  save(): unknown;
  /** Lets go of what the session holds when the workspace closes. */
  dispose?(): void;
}

/** Saves and restores a feature's UI state per workspace. One per feature. */
export interface PersistContribution {
  /**
   * Starts the feature's UI state when a workspace opens.
   *
   * @param saved what `save` returned last time for this workspace, or `undefined`
   */
  activate(saved: unknown, context: WorkspaceContext): PersistedSession;
}
