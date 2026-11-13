import { errorMessageFor } from "@halonicjs/studio-shell";
import type {
  ListedToolPick,
  ListedToolRow,
  ListedToolsHost,
  ListedToolsSnapshot,
  RefusedListedToolRow,
} from "./listed-tools-host.ts";
import { listedToolsWords } from "./listed-tools-words.ts";

/** What the screen shows after the search: every group filtered by the same text. */
export interface ShownTools {
  readonly toReview: readonly ListedToolRow[];
  readonly keepsChanging: readonly ListedToolRow[];
  readonly refused: readonly RefusedListedToolRow[];
}

/**
 * The tools a search leaves on the screen. It matches the name and the description, ignoring
 * case, in every group; refused tools match on their name and reason. An empty search shows all.
 */
export function shownTools(snapshot: ListedToolsSnapshot, search: string): ShownTools {
  const text = search.trim().toLowerCase();
  const matches = (...fields: readonly string[]) =>
    text === "" || fields.some((field) => field.toLowerCase().includes(text));
  const matchesRow = (row: ListedToolRow) => matches(row.name, row.description);
  return {
    toReview: snapshot.toReview.filter(matchesRow),
    keepsChanging: snapshot.keepsChanging.filter(matchesRow),
    refused: snapshot.refused.filter((row) => matches(row.name, row.reason)),
  };
}

/** How many tools the screen lists, before any search. The search field shows only above a threshold. */
export function listedToolCount(snapshot: ListedToolsSnapshot): number {
  return (
    snapshot.toReview.length +
    snapshot.keepsChanging.length +
    snapshot.refused.length +
    snapshot.approved.length
  );
}

/** What the screen shows. */
export interface ListedToolsReviewState {
  readonly phase: "loading" | "ready" | "failed";
  /** Why the list couldn't be read, while `phase` is `failed`. */
  readonly loadError?: string;
  readonly snapshot?: ListedToolsSnapshot;
  readonly search: string;
  /** The names ticked. A tick on a row the search hides is kept, and not approved. */
  readonly ticked: ReadonlySet<string>;
  /** Approving or removing is under way. */
  readonly busy: boolean;
  /** The line above the bar: nothing ticked, or why approving failed. */
  readonly approveError?: string | undefined;
  /** Tools that changed again while the screen was open. Their ticks are cleared and the current version shows. */
  readonly changedAgain: readonly string[];
}

/** What the screen does after an action: stay, or close with a toast. `null` closes without one. */
export type ReviewOutcome =
  | { readonly kind: "stay" }
  | { readonly kind: "close"; readonly toast: string | null };

const stay: ReviewOutcome = { kind: "stay" };

/**
 * One connector's review of its listed tools. It reads the tools from the host, keeps the
 * ticks and the search, and approves only what the screen shows, at the version shown (the
 * rule `halonic tools approve --all` follows). The screen reads it with `useSyncExternalStore`.
 */
export class ListedToolsReviewModel {
  state: ListedToolsReviewState = {
    phase: "loading",
    search: "",
    ticked: new Set(),
    busy: false,
    changedAgain: [],
  };
  private readonly listeners = new Set<() => void>();
  private stopHost: (() => void) | undefined;
  private latest = 0;

  private readonly host: ListedToolsHost;
  readonly connectorId: string;

  constructor(host: ListedToolsHost, connectorId: string) {
    this.host = host;
    this.connectorId = connectorId;
  }

  /** Calls `listener` after each change of `state`; returns the way to stop. The first listener starts the reading. */
  subscribe(listener: () => void): () => void {
    if (this.listeners.size === 0) {
      this.stopHost = this.host.subscribe(() => void this.refresh());
      void this.refresh();
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stopHost?.();
        this.stopHost = undefined;
      }
    };
  }

  /** The tools the search leaves on the screen. */
  get shown(): ShownTools {
    return this.state.snapshot === undefined
      ? { toReview: [], keepsChanging: [], refused: [] }
      : shownTools(this.state.snapshot, this.state.search);
  }

  /**
   * Reads the tools again. A tool that is now waiting at another version than the one that was
   * on screen is reported in `changedAgain` and loses its tick. An older answer never replaces a
   * newer one. A failure keeps what was shown.
   */
  async refresh(): Promise<void> {
    const ticket = ++this.latest;
    // A retry after a failed first reading shows the loading rows again, so a second failure
    // is not mistaken for a click that did nothing.
    if (this.state.phase === "failed") this.set({ phase: "loading" });
    try {
      const snapshot = await this.host.review(this.connectorId);
      if (ticket !== this.latest) return;
      this.set(this.afterReading(snapshot));
    } catch (error) {
      if (ticket !== this.latest) return;
      this.set(
        this.state.snapshot === undefined ? { phase: "failed", loadError: reasonOf(error) } : {},
      );
    }
  }

  private afterReading(snapshot: ListedToolsSnapshot): Partial<ListedToolsReviewState> {
    const before = this.versionsOnScreen();
    const waiting = new Map(
      [...snapshot.toReview, ...snapshot.keepsChanging].map((row) => [row.name, row.fingerprint]),
    );
    const changedAgain = [...before].flatMap(([name, fingerprint]) =>
      waiting.has(name) && waiting.get(name) !== fingerprint ? [name] : [],
    );
    return {
      phase: "ready",
      snapshot,
      changedAgain,
      ticked: new Set(
        [...this.state.ticked].filter((name) => waiting.has(name) && !changedAgain.includes(name)),
      ),
    };
  }

  private versionsOnScreen(): Map<string, string> {
    const { snapshot } = this.state;
    return new Map(
      snapshot === undefined
        ? []
        : [...snapshot.toReview, ...snapshot.keepsChanging].map((row) => [
            row.name,
            row.fingerprint,
          ]),
    );
  }

  setSearch(search: string): void {
    this.set({ search });
  }

  /** Ticks or unticks one tool. Only a tool to review can be ticked. */
  toggle(name: string): void {
    const ticked = new Set(this.state.ticked);
    if (ticked.has(name)) {
      ticked.delete(name);
    } else if (this.state.snapshot?.toReview.some((row) => row.name === name)) {
      ticked.add(name);
    }
    this.set({ ticked, approveError: undefined });
  }

  /** Approves the ticked tools the search shows. With none, it says so and approves nothing. */
  async approveSelected(): Promise<ReviewOutcome> {
    const picks = this.picks(this.shown.toReview.filter((row) => this.state.ticked.has(row.name)));
    if (picks.length === 0) {
      this.set({ approveError: listedToolsWords.tickSomething });
      return stay;
    }
    return this.approve(picks);
  }

  /** Approves every tool to review that the search shows, each at the version shown. Tools that keep changing are never in it. */
  async approveAll(): Promise<ReviewOutcome> {
    return this.approve(this.picks(this.shown.toReview));
  }

  /** Approves one tool that keeps changing, at the version shown. It is the only way such a tool is approved. */
  async approveThisVersion(name: string): Promise<ReviewOutcome> {
    const row = this.state.snapshot?.keepsChanging.find((candidate) => candidate.name === name);
    return row === undefined ? stay : this.approve(this.picks([row]));
  }

  /** Closes the screen as "none": the toast says what stays off. The tools are still waiting, so the badge stays. */
  approveNone(): ReviewOutcome {
    const { snapshot } = this.state;
    const waiting = snapshot === undefined ? 0 : snapshot.toReview.length;
    return {
      kind: "close",
      toast:
        waiting === 0 ? null : listedToolsWords.approvedNone(snapshot?.sourceName ?? "", waiting),
    };
  }

  /** Removes the approval of one tool, then reads the list again. Returns the toast to show once the screen closes. */
  async removeApproval(toolName: string): Promise<string | undefined> {
    if (this.state.busy) return undefined;
    this.set({ busy: true, approveError: undefined });
    try {
      await this.host.removeApproval(this.connectorId, toolName);
    } catch (error) {
      this.set({ busy: false, approveError: listedToolsWords.couldntApprove(reasonOf(error)) });
      return undefined;
    }
    this.set({ busy: false });
    await this.refresh();
    return listedToolsWords.removed(toolName);
  }

  private picks(rows: readonly ListedToolRow[]): ListedToolPick[] {
    return rows.map((row) => ({ name: row.name, fingerprint: row.fingerprint }));
  }

  private async approve(picks: readonly ListedToolPick[]): Promise<ReviewOutcome> {
    if (picks.length === 0 || this.state.busy) return stay;
    this.set({ busy: true, approveError: undefined });
    let result: Awaited<ReturnType<ListedToolsHost["approve"]>>;
    try {
      result = await this.host.approve(this.connectorId, picks);
    } catch (error) {
      this.set({ busy: false, approveError: listedToolsWords.couldntApprove(reasonOf(error)) });
      return stay;
    }
    this.set({ busy: false });
    await this.refresh();
    if (result.changed.length > 0) {
      this.set({ changedAgain: result.changed });
      return stay;
    }
    const sourceName = this.state.snapshot?.sourceName ?? "";
    const stayingOff = this.state.snapshot?.toReview.length ?? 0;
    return {
      kind: "close",
      toast: listedToolsWords.approved(result.approved.length, sourceName, stayingOff),
    };
  }

  private set(change: Partial<ListedToolsReviewState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of [...this.listeners]) listener();
  }
}

function reasonOf(error: unknown): string {
  return errorMessageFor(error, { title: "Couldn't approve" }).body.trim().replace(/\.$/, "");
}
