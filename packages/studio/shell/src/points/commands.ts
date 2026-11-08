import type { WorkspaceContext } from "../workspace-context.ts";
import type { ItemRef } from "./item-kinds.ts";
import type { Ordered } from "./point-store.ts";

/** A command people can run from the palette, a menu or a shortcut. Ids are unique. */
export interface CommandContribution {
  /** Unique, such as `agents.new`. */
  readonly id: string;
  readonly title: string;
  run(context: WorkspaceContext): void | Promise<void>;
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
  /** Modifiers and one key joined by `+`, such as `Ctrl+Alt+A`. Case and modifier order don't matter. */
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
  readonly detail?: string;
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
