import { ShellError } from "../shell-error.ts";
import type {
  CommandContribution,
  KeybindingContribution,
  PersistContribution,
  SearchProviderContribution,
} from "./commands.ts";
import { KeybindingTable } from "./keybindings.ts";
import {
  byOrder,
  type Point,
  type PointGuard,
  PointStore,
  pointOn,
  type Registered,
  registered,
} from "./point-store.ts";

/** The points for commands, shortcuts, search and saved UI state. */
export interface CommandPoints {
  readonly commands: Point<CommandContribution>;
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
    /** Every command, sorted by id. */
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
  private readonly keybindings = new KeybindingTable();
  private readonly searchProviders = new PointStore<SearchProviderContribution>(
    "search.addProvider",
    ["id"],
  );
  private readonly persisted: Registered<PersistContribution>[] = [];

  /** The command points for one feature. */
  pointsFor(featureId: string, guard: PointGuard): CommandPoints {
    return {
      commands: pointOn("commands.add", this.commands, featureId, guard),
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
   * @throws ShellError for a keybinding whose command no feature adds
   */
  check(): void {
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
        list: () => [...this.commands.all()].sort((left, right) => (left.id < right.id ? -1 : 1)),
        get: (id) => this.commands.get(id),
      },
      keybindings: {
        list: () => this.keybindings.list(),
        resolve: (keys, activeContexts) => this.keybindings.resolve(keys, activeContexts),
      },
      search: { providers: () => byOrder(this.searchProviders.all()) },
      persist: { list: () => [...this.persisted] },
    };
  }
}
