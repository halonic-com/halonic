// The plugin commands, as `app.plugin-commands` asks: `halonic plugin`'s
// operations offered to Studio on a workspace's command bus, so Studio and
// the CLI add, list, trust and remove a plugin through the same
// `PluginService` calls. Plugins live in the profile, not the workspace, so
// every workspace's bus runs them on the one service the host passes in.

import type { FolderReader, TrustGrant } from "@halonicjs/ports";
import type { Result } from "@halonicjs/std";
import type { CommandBus, CommandMap, CommandSpec } from "./command-bus.ts";
import type { PluginSource } from "./plugin-installs.ts";
import type {
  DeletePluginSecret,
  PluginAddRefusal,
  PluginEntry,
  PluginRemoveRefusal,
  PluginService,
  PluginTrustRefusal,
} from "./plugin-service.ts";

/** What `plugins.add` takes: the plugin's files, read through their own reader, and where they came from. */
export interface AddPluginCommand {
  /** The plugin's folder, or one commit of a git address exported by the host. */
  readonly source: FolderReader;
  readonly from: PluginSource;
  /** Put it in place of the plugin with the same id, for a new commit of it. */
  readonly replace?: boolean;
}

/** What `plugins.trust` takes: the plugin and the full fingerprint the person was shown. */
export interface TrustPluginCommand {
  readonly id: string;
  readonly fingerprint: string;
}

/** The plugin commands, by name. */
export interface PluginCommands {
  /** Every plugin in the profile's plugins folder, read, checked and with its trust status. */
  "plugins.list": CommandSpec<void, PluginEntry[]>;
  /** Adds a plugin, off until a person trusts it; nothing is written when it's refused. */
  "plugins.add": CommandSpec<AddPluginCommand, Result<PluginEntry, PluginAddRefusal>>;
  /** Trusts the plugin only when the fingerprint is still exactly its own. */
  "plugins.trust": CommandSpec<TrustPluginCommand, Result<TrustGrant, PluginTrustRefusal>>;
  /** Turns the plugin off by forgetting its trust; its settings and secrets stay. */
  "plugins.revoke": CommandSpec<{ readonly id: string }, void>;
  /** Removes the plugin with its trust, secrets and settings. */
  "plugins.remove": CommandSpec<{ readonly id: string }, Result<void, PluginRemoveRefusal>>;
}

declare module "./workspace-scope.ts" {
  interface AppCommands extends PluginCommands {}
}

/** What the plugin commands run on: the profile's one plugin service and the host's own secret writer. */
export interface PluginCommandsHost {
  readonly service: PluginService;
  /** Deletes a removed plugin's secrets from the host's `Secrets`. */
  readonly deleteSecret: DeletePluginSecret;
}

/**
 * Registers the plugin commands on a workspace's bus. A trust given
 * through `plugins.trust` is recorded as given at a trust check
 * (`prompt`), as Studio asks it.
 *
 * @returns a function that removes the handlers again, such as when the workspace closes
 * @throws CommandError when a plugin command already has a handler on this bus
 *
 * @example
 * const unregister = registerPluginCommands(scope.commands, { service, deleteSecret });
 * const entries = await scope.commands.execute("plugins.list");
 */
export function registerPluginCommands<Commands extends CommandMap<Commands> & PluginCommands>(
  commands: CommandBus<Commands>,
  host: PluginCommandsHost,
): () => void {
  const { service, deleteSecret } = host;
  const handlers: (() => () => void)[] = [
    () => commands.register("plugins.list", () => service.load()),
    () =>
      commands.register("plugins.add", ({ source, from, replace }) =>
        service.add(source, { from, replace: replace ?? false }),
      ),
    () =>
      commands.register("plugins.trust", ({ id, fingerprint }) =>
        service.trust(id, fingerprint, "prompt"),
      ),
    () => commands.register("plugins.revoke", ({ id }) => service.revoke(id)),
    () => commands.register("plugins.remove", ({ id }) => service.remove(id, deleteSecret)),
  ];
  const unregister: (() => void)[] = [];
  const unregisterAll = () => {
    for (const each of unregister) each();
  };
  try {
    for (const register of handlers) unregister.push(register());
  } catch (error) {
    // One of them already had a handler: leave the bus as it was.
    unregisterAll();
    throw error;
  }
  return unregisterAll;
}
