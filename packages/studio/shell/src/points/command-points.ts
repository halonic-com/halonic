import { ShellError } from "../shell-error.ts";
import type {
  CommandContribution,
  CommandSource,
  KeybindingContribution,
  PersistContribution,
  SearchProviderContribution,
} from "./commands.ts";
import { KeybindingTable, type KeyboardPlatform } from "./keybindings.ts";
import {
  byOrder,
  isContributionId,
  type Point,
  type PointGuard,
  PointStore,
  pointOn,
  type Registered,
  registered,
} from "./point-store.ts";

/** The points for commands, shortcuts, search and saved UI state. */
export interface CommandPoints {
  readonly commands: Point<CommandContribution> & {
    /**
     * Adds commands that come and go while Studio runs. A shortcut can only bind a command
     * added with `add`.
     *
     * @throws ShellError when its id isn't valid or another source has it
     */
    addSource(source: CommandSource): void;
  };
  readonly keybindings: Point<KeybindingContribution>;
  readonly search: { addProvider(provider: SearchProviderContribution): void };
  /**
   * Saves and restores the feature's UI state per workspace. Call it at most once.
   *
   * @throws ShellError when the feature already called it
   */
  persist(contribution: PersistContribution): void;
}

/** What the shell reads for the palette, the keybinding table, search and saving. */
export interface CommandContributions {
  readonly commands: {
    /** Every command, those of the sources as they are now included, sorted by id. */
    list(): readonly Registered<CommandContribution>[];
    get(id: string): Registered<CommandContribution> | undefined;
  };
  readonly keybindings: {
    list(): readonly Registered<KeybindingContribution>[];
    /**
     * The binding a key press runs while the given contexts are active. Of the
     * bindings whose `when` holds, the one with the most conditions wins; between
     * equally specific ones, the first registered.
     */
    resolve(
      keys: string,
      activeContexts: ReadonlySet<string>,
    ): Registered<KeybindingContribution> | undefined;
  };
  readonly search: { providers(): readonly Registered<SearchProviderContribution>[] };
  /** One entry per feature that calls `persist`; `featureId` is the key to save under. */
  readonly persist: { list(): readonly Registered<PersistContribution>[] };
}

/** Holds commands, keybindings, search providers and persist hooks while features register. */
export class CommandStores {
  private readonly commands = new PointStore<CommandContribution>("commands.add", ["id"]);
  private readonly keybindings: KeybindingTable;
  private readonly sources = new PointStore<CommandSource>("commands.addSource", ["id"]);
  private readonly searchProviders = new PointStore<SearchProviderContribution>(
    "search.addProvider",
    ["id"],
  );
  private readonly persisted: Registered<PersistContribution>[] = [];

  /** @param platform decides what `Mod` means in keybindings */
  constructor(platform?: KeyboardPlatform) {
    this.keybindings = new KeybindingTable(platform);
  }

  /** The command points for one feature. */
  pointsFor(featureId: string, guard: PointGuard): CommandPoints {
    return {
      commands: {
        ...pointOn("commands.add", this.commands, featureId, guard),
        addSource: pointOn("commands.addSource", this.sources, featureId, guard).add,
      },
      keybindings: {
        add: (binding) => {
          guard("keybindings.add");
          this.keybindings.add(featureId, binding);
        },
      },
      search: {
        addProvider: pointOn("search.addProvider", this.searchProviders, featureId, guard).add,
      },
      persist: (contribution) => {
        guard("persist");
        if (this.persisted.some((entry) => entry.featureId === featureId)) {
          throw new ShellError(
            `The feature "${featureId}" calls persist twice. Keep all its UI state in one.`,
          );
        }
        this.persisted.push(registered("persist", featureId, contribution));
      },
    };
  }

  /**
   * Checks what can only be checked once every feature registered.
   *
   * @throws ShellError for a keybinding whose command no feature adds, or a command or command
   *   source whose id starts with another source's id
   */
  check(): void {
    for (const source of this.sources.all()) {
      const clash =
        this.commands.all().find((command) => command.id.startsWith(`${source.id}.`)) ??
        this.sources.all().find((other) => other.id.startsWith(`${source.id}.`));
      if (clash !== undefined) {
        throw new ShellError(
          `commands.addSource: "${clash.id}" from the feature "${clash.featureId}" starts with "${source.id}", the command source of "${source.featureId}". Ids under a source are its own; rename one.`,
        );
      }
    }
    for (const binding of this.keybindings.list()) {
      if (this.commands.get(binding.command) === undefined) {
        throw new ShellError(
          `keybindings.add: the feature "${binding.featureId}" binds ${binding.keys} to "${binding.command}", but no feature adds that command.`,
        );
      }
    }
  }

  /** The read side. */
  contributions(): CommandContributions {
    return {
      commands: {
        list: () =>
          [...this.commands.all(), ...this.sourceCommands()].sort((left, right) =>
            left.id < right.id ? -1 : 1,
          ),
        get: (id) =>
          this.commands.get(id) ?? this.sourceCommands().find((command) => command.id === id),
      },
      keybindings: {
        list: () => this.keybindings.list(),
        resolve: (keys, activeContexts) => this.keybindings.resolve(keys, activeContexts),
      },
      search: { providers: () => byOrder(this.searchProviders.all()) },
      persist: { list: () => [...this.persisted] },
    };
  }

  /** The commands the sources give now, leaving out those they may not give and every one of a source that throws. */
  private sourceCommands(): Registered<CommandContribution>[] {
    return this.sources.all().flatMap((source) => {
      let given: readonly CommandContribution[];
      try {
        given = source.commands();
      } catch {
        return [];
      }
      const seen = new Set<string>();
      return given.flatMap((command) => {
        const id: unknown = command?.id;
        if (!isContributionId(id) || !id.startsWith(`${source.id}.`) || seen.has(id)) {
          return [];
        }
        seen.add(id);
        try {
          return [registered("commands.addSource", source.featureId, command)];
        } catch {
          return [];
        }
      });
    });
  }
}
