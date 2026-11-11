import type { CommandSource } from "@halonicjs/studio-shell";
import { commandSource } from "./command-text.ts";
import type { PluginCommand } from "./plugin-command-dialog.tsx";

/** The id of the plugins' command source; each command's id starts with it. */
export const PLUGIN_COMMANDS_SOURCE = "plugins.commands";

/**
 * One trusted plugin's commands, as `PluginService.ui` gives them: its id, its name, which is
 * untrusted text, and its `ui`.
 */
export interface PluginCommands {
  readonly plugin: string;
  readonly name: string;
  readonly ui: { readonly commands: readonly PluginCommand[] };
}

/** The command a person picked in Ctrl K, and the plugin it comes from. */
export interface OpenedCommand {
  readonly plugin: { readonly id: string; readonly name: string };
  readonly command: PluginCommand;
  /** Counts each opening, so opening the same command again starts a fresh dialog. */
  readonly opening: number;
}

/**
 * Which plugin command's dialog is open, if any. The command source opens one; the
 * `PluginCommandHost` draws it and closes it.
 */
export class PluginCommandOpener {
  private opened: OpenedCommand | undefined;
  private openings = 0;
  private readonly listeners = new Set<() => void>();

  /** The open command, or `undefined` when no dialog is open. */
  readonly current = (): OpenedCommand | undefined => this.opened;

  /** Calls `listener` each time a dialog opens or closes; returns the way to stop. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Opens the command's dialog, in place of one that's open. */
  open(plugin: OpenedCommand["plugin"], command: PluginCommand): void {
    this.openings += 1;
    this.set({ plugin, command, opening: this.openings });
  }

  close(): void {
    this.set(undefined);
  }

  private set(opened: OpenedCommand | undefined): void {
    this.opened = opened;
    for (const listener of this.listeners) listener();
  }
}

/**
 * The palette's command source for plugins (design 8.1, UX checklist B2 and B6): a command for
 * each command of each plugin `plugins` gives now, as `plugins.commands.<plugin>.<command>`, with
 * the plugin's command title and the source "*name* plugin". Running one opens its dialog. The
 * shell asks again each time the palette opens, so a plugin that's turned off or no longer
 * trusted takes its commands with it.
 *
 * @param plugins - the trusted plugins' `ui` now, such as `() => service.ui(entries)`
 *
 * @example
 * studio.commands.addSource(pluginCommandSource(() => pluginUi(), opener));
 */
export function pluginCommandSource(
  plugins: () => readonly PluginCommands[],
  opener: PluginCommandOpener,
): CommandSource {
  return {
    id: PLUGIN_COMMANDS_SOURCE,
    commands: () =>
      plugins().flatMap(({ plugin, name, ui }) =>
        ui.commands.map((command) => ({
          id: `${PLUGIN_COMMANDS_SOURCE}.${plugin}.${command.id}`,
          title: command.title,
          source: commandSource(name),
          run: () => opener.open({ id: plugin, name }, command),
        })),
      ),
  };
}
