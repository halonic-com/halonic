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
        this.entries.add(featureId, entry);
        checkEntryLabel(entry, featureId);
      },
    };
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
}

/** The rail's entries are fixed by design, so a feature can't make one up or add Home or Settings. */
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
