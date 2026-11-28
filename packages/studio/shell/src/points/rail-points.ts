import { ShellError } from "../shell-error.ts";
import {
  byOrder,
  type Point,
  type PointGuard,
  PointStore,
  type Registered,
} from "./point-store.ts";
import {
  type FolderFacts,
  homeRailEntry,
  type RailEntry,
  type RailEntryContribution,
  railEntryIds,
  type ShownRailEntryId,
  settingsRailEntry,
} from "./rail.ts";

/** The id the shell's own rail entries carry as their `featureId`. */
const shellId = "shell";

/** What the shell's frame reads from the rail (`shell.rail-entries`). */
export interface RailContributions {
  /**
   * The entries to show for a folder with these facts: Home, then each feature's entry whose
   * rule holds, by `order`, then Settings last. `kept` stays in even when its rule no longer
   * holds, so the entry the active tab shows never disappears under the person.
   */
  shown(facts: FolderFacts, kept?: ShownRailEntryId): readonly Registered<RailEntry>[];
}

/** Holds the rail entries features add, then serves the ones a folder shows. */
export class RailStore {
  private readonly entries = new PointStore<RailEntryContribution>("rail.add", ["id"]);

  /** The `rail` point for one feature. */
  pointFor(featureId: string, guard: PointGuard): Point<RailEntryContribution> {
    return {
      add: (entry) => {
        guard("rail.add");
        rejectUnknownEntry(entry, featureId);
        this.rejectTakenEntry(entry, featureId);
        checkEntryLabel(entry, featureId);
        this.rejectHeldKeys(entry, featureId);
        this.entries.add(featureId, entry);
      },
    };
  }

  /**
   * Checks, once every feature has registered, that no entry holds an item kind whose place
   * another entry holds: the tab would then belong to both (`shell.rail`).
   *
   * @throws ShellError naming both entries
   */
  check(placeOfKind: (kind: string) => string | undefined): void {
    const all: readonly RailEntry[] = [homeRailEntry, ...this.entries.all()];
    for (const entry of all) {
      for (const key of entry.holds) {
        const place = placeOfKind(key);
        if (place === undefined) continue;
        const holder = all.find((other) => other !== entry && other.holds.includes(place));
        if (holder !== undefined) {
          throw new ShellError(
            `rail.add: the entry "${entry.id}" holds the kind "${key}", whose place "${place}" the entry "${holder.id}" holds. Hold the place in one entry only.`,
          );
        }
      }
    }
  }

  /** The read side, for the shell's frame. */
  contributions(): RailContributions {
    const home = Object.freeze({ ...homeRailEntry, featureId: shellId });
    const settings = Object.freeze({ ...settingsRailEntry, featureId: shellId });
    return {
      shown: (facts, kept) => {
        const features = this.entries
          .all()
          .filter((entry) => entry.id === kept || entry.shows(facts));
        return [home, ...byOrder(features), settings];
      },
    };
  }

  /** An entry is one sub-app, so the generic "rename one" message wouldn't help. */
  private rejectTakenEntry(entry: RailEntryContribution, featureId: string): void {
    const existing = this.entries.get(entry.id);
    if (existing !== undefined) {
      throw new ShellError(
        `rail.add: the entry "${entry.id}" is added by both "${existing.featureId}" and "${featureId}". Each rail entry belongs to one feature.`,
      );
    }
  }

  /**
   * A tab can be in one entry only, so two entries holding a key would make the selection a
   * guess.
   */
  private rejectHeldKeys(entry: RailEntryContribution, featureId: string): void {
    const others = [homeRailEntry, ...this.entries.all()];
    for (const key of entry.holds) {
      const holder = others.find((other) => other.holds.includes(key));
      if (holder !== undefined) {
        const by = "featureId" in holder ? `"${holder.featureId}"` : "the shell";
        throw new ShellError(
          `rail.add: the feature "${featureId}" holds "${key}" in the entry "${entry.id}", which ${by} already holds in "${holder.id}". A tab is in one entry only.`,
        );
      }
    }
  }
}

/**
 * The rail's entries are fixed by design, so a feature can't make one up or add Home or
 * Settings.
 */
function rejectUnknownEntry(entry: RailEntryContribution, featureId: string): void {
  const id: string = entry.id;
  if (id === homeRailEntry.id || id === settingsRailEntry.id) {
    throw new ShellError(
      `rail.add: the feature "${featureId}" adds the entry "${id}", which the shell adds itself.`,
    );
  }
  if (!(railEntryIds as readonly string[]).includes(id)) {
    throw new ShellError(
      `rail.add: the feature "${featureId}" adds the entry ${JSON.stringify(id)}, which isn't one of the rail's entries (${railEntryIds.join(", ")}). Add a page to an entry's list instead, or ask for a new entry in the design.`,
    );
  }
}

/** The tooltip and screen readers name the entry by its label, so it can't be empty. */
function checkEntryLabel(entry: RailEntryContribution, featureId: string): void {
  if (typeof entry.label !== "string" || entry.label.trim() === "") {
    throw new ShellError(
      `rail.add: the feature "${featureId}" gives the entry "${entry.id}" no label. Give it the name its tooltip shows, such as "Inbox".`,
    );
  }
}
