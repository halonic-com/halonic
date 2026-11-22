import { announceQuietMs, type ItemRef, type ShownPage } from "@halonicjs/studio-shell";
import type { Inbox } from "./inbox.ts";
import { needsYouNews, waits } from "./inbox-count.ts";
import { type InboxItem, isRunItem } from "./inbox-items.ts";

/**
 * The runs a page other than the Inbox shows and announces itself when they wait for you, such as
 * a workflow page's docked Run panel card, each with the page that shows it. While that page
 * shows, the Inbox doesn't say "Waiting for you" for the run.
 *
 * @example
 * const stop = inbox.shownRuns.add(runId, { kind: "workflow", hub, id: workflowId });
 */
export class ShownRuns {
  readonly #shown = new Set<{ readonly runId: string; readonly on: ItemRef }>();

  /** Notes that the item's page shows the run. Returns the function to call when it stops. */
  add(runId: string, on: ItemRef): () => void {
    const entry = { runId, on };
    this.#shown.add(entry);
    return () => this.#shown.delete(entry);
  }

  /** Whether the page says when the run waits: the run's own page, or a page that noted it. */
  saidOn(runId: string, page: ShownPage): boolean {
    const { item } = page;
    if (item === undefined) return false;
    if (item.kind === "run" && item.id === runId) return true;
    for (const { runId: shown, on } of this.#shown) {
      if (shown === runId && sameItem(on, item)) return true;
    }
    return false;
  }
}

function sameItem(left: ItemRef, right: ItemRef): boolean {
  return left.kind === right.kind && left.hub === right.hub && left.id === right.id;
}

/** The announcer's key for the news, so items that come within 2 s are read once, together. */
export const needsYouNewsKey = "inbox.needs-you";

/** What {@link watchNeedsYou} needs from the window. */
export interface NeedsYouNewsOptions {
  /** The page the window shows (`WorkspaceContext.shown`); without it, no page says it itself. */
  readonly shown?: (() => ShownPage) | undefined;
  /** An item's title, as its row shows it. */
  readonly title: (item: InboxItem) => string;
  /** Reads the last text for a key once 2 s pass without another: `announcer.announceState`. */
  readonly say: (key: string, text: string) => void;
  /** The time in milliseconds; tests pass a fake clock. */
  readonly now?: () => number;
}

/**
 * Says "Waiting for you: …" each time the Needs you count goes up while the Inbox isn't showing
 * (microcopy 19.2, a11y check A8): inside the Inbox the new card takes focus, so its title is read
 * there. Items that come within 2 s of each other are said together. An item whose run's own page,
 * or a page that shows its run ({@link ShownRuns}), is showing is left out, since that page says it.
 * What waits when it starts, or when the Inbox first loads, isn't news. Returns the function that
 * stops it.
 *
 * @example
 * const stop = watchNeedsYou(inbox, { shown: context.shown, title: itemTitle, say: announceState });
 */
export function watchNeedsYou(inbox: Inbox, options: NeedsYouNewsOptions): () => void {
  const now = options.now ?? Date.now;
  let known = inbox.state.loaded ? waitingKeys(inbox.state.items) : undefined;
  let news: string[] = [];
  let lastAt = Number.NEGATIVE_INFINITY;
  return inbox.subscribe(() => {
    const { items, loaded } = inbox.state;
    if (!loaded) return;
    const before = known;
    known = waitingKeys(items);
    if (before === undefined || known.size <= before.size) return;
    const page = options.shown?.() ?? {};
    if (page.place === "inbox") return;
    const arrived = items.filter(
      (item) => waits(item) && !before.has(item.key) && !saidOn(inbox.shownRuns, item, page),
    );
    if (arrived.length === 0) return;
    const at = now();
    if (at - lastAt >= announceQuietMs) news = [];
    lastAt = at;
    news.push(...arrived.map(options.title));
    options.say(needsYouNewsKey, needsYouNews(news, known.size));
  });
}

function waitingKeys(items: readonly InboxItem[]): ReadonlySet<string> {
  return new Set(items.filter(waits).map((item) => item.key));
}

// A page says when a run waits; a proposal's run has ended, so no page has said it.
function saidOn(shownRuns: ShownRuns, item: InboxItem, page: ShownPage): boolean {
  return isRunItem(item) && shownRuns.saidOn(item.runId, page);
}
