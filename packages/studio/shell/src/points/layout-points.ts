import { ShellError } from "../shell-error.ts";
import type { ItemKindContribution } from "./item-kinds.ts";
import type {
  ExplorerGroupContribution,
  ExplorerSectionContribution,
  ItemPageSectionContribution,
} from "./layout.ts";
import {
  byOrder,
  type Contributed,
  type Point,
  type PointGuard,
  PointStore,
  pointOn,
  type Registered,
} from "./point-store.ts";

/** The layout points a feature adds to in `register`. Each throws a `ShellError` on a duplicate id. */
export interface LayoutPoints {
  readonly itemKinds: Point<ItemKindContribution>;
  readonly explorer: {
    addGroup(group: ExplorerGroupContribution): void;
    addSection(section: ExplorerSectionContribution): void;
  };
  readonly itemPage: { addSection(section: ItemPageSectionContribution): void };
}

/**
 * What the shell's layout reads. Explorer groups, explorer sections and item
 * page sections are sorted by `order`, then `id`. Item kinds have no `order`,
 * so they are listed in the order they were added.
 */
export interface LayoutContributions {
  readonly itemKinds: {
    /** Every item kind, in the order they were added. */
    list(): readonly Registered<ItemKindContribution>[];
    get(kind: string): Registered<ItemKindContribution> | undefined;
  };
  readonly explorer: {
    groups(): readonly Registered<ExplorerGroupContribution>[];
    sections(): readonly Registered<ExplorerSectionContribution>[];
  };
  readonly itemPage: {
    sectionsFor(kind: string): readonly Registered<ItemPageSectionContribution>[];
  };
}

/** Holds every layout contribution while features register, then serves them. */
export class LayoutStores {
  private readonly itemKinds = new PointStore<ItemKindContribution>("itemKinds.add", ["kind"]);
  private readonly explorerGroups = new PointStore<ExplorerGroupContribution>("explorer.addGroup", [
    "id",
  ]);
  private readonly explorerSections = new PointStore<ExplorerSectionContribution>(
    "explorer.addSection",
    ["id"],
  );
  private readonly itemPageSections = new PointStore<ItemPageSectionContribution>(
    "itemPage.addSection",
    ["on", "id"],
  );

  /** The layout points for one feature. */
  pointsFor(featureId: string, guard: PointGuard): LayoutPoints {
    const pointOf = <Contribution>(name: string, store: PointStore<Contribution>) =>
      pointOn(name, store, featureId, guard);
    return {
      itemKinds: pointOf("itemKinds.add", this.itemKinds),
      explorer: {
        addGroup: (group) => {
          guard("explorer.addGroup");
          this.rejectExplorerId(group.id, featureId, this.explorerSections);
          this.explorerGroups.add(featureId, group);
        },
        addSection: (section) => {
          guard("explorer.addSection");
          this.rejectExplorerId(section.id, featureId, this.explorerGroups);
          this.explorerSections.add(featureId, section);
        },
      },
      itemPage: { addSection: pointOf("itemPage.addSection", this.itemPageSections).add },
    };
  }

  /**
   * Checks what can only be checked once every feature registered.
   *
   * @throws ShellError for an item page section on a kind no feature adds
   */
  check(): void {
    for (const section of this.itemPageSections.all()) {
      if (this.itemKinds.get(section.on) === undefined) {
        throw new ShellError(
          `itemPage.addSection: the feature "${section.featureId}" adds "${section.id}" to the page of "${section.on}", but no feature adds the item kind "${section.on}". Check the kind, or add the feature that owns it.`,
        );
      }
    }
  }

  /** The read side, for the shell's layout. */
  contributions(): LayoutContributions {
    return {
      itemKinds: { list: () => this.itemKinds.all(), get: (kind) => this.itemKinds.get(kind) },
      explorer: {
        groups: () => byOrder(this.explorerGroups.all()),
        sections: () => byOrder(this.explorerSections.all()),
      },
      itemPage: {
        sectionsFor: (kind) =>
          byOrder(this.itemPageSections.all().filter((section) => section.on === kind)),
      },
    };
  }

  // Groups and sections share the sidebar, and its collapse state is kept by id.
  private rejectExplorerId(
    id: string,
    featureId: string,
    other: { get(id: string): Contributed | undefined },
  ): void {
    const existing = other.get(id);
    if (existing !== undefined) {
      throw new ShellError(
        `explorer: "${id}" is added by both "${existing.featureId}" and "${featureId}". Group and section ids share the sidebar; rename one.`,
      );
    }
  }
}
