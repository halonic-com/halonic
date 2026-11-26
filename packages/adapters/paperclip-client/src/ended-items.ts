import type { InboxItem, InboxItemState } from "@halonicjs/ports";

/** How long an approval or decision that ended stays listed with its final state: a day. */
export const endedKeptMs = 24 * 60 * 60 * 1000;

/** At most this many ended approvals and decisions stay listed; the ones that ended first go first. */
export const endedKeptMax = 50;

/**
 * Reads again the items that were listed last time and are gone from this read, and gives back
 * those it found, with their state now. One it gives back still open stays listed; one it
 * doesn't give back ended without anyone saying how.
 */
export type EndedLookUp = (gone: readonly InboxItem[]) => Promise<readonly InboxItem[]>;

/**
 * Keeps approvals and decisions that ended elsewhere in the list, with their final state, for a
 * day (`paperclip-client.closed-items`). Paperclip lists only the ones that wait, so one that was
 * listed last time and is gone now is read once more, and only then: it never reads every
 * decided approval. One gone with no final state to read is `closed` as `cancelled` from the
 * time it was missed, since it ended without a decision here.
 */
export class EndedItems {
  #listed: readonly InboxItem[] = [];
  #ended = new Map<string, InboxItem>();

  /**
   * `read` with the items that ended since, and those that ended in the last day. When `lookUp`
   * fails, nothing is remembered, so the next list tries again.
   */
  async list(read: readonly InboxItem[], lookUp: EndedLookUp, now: Date): Promise<InboxItem[]> {
    const readIds = new Set(read.map((item) => item.id));
    const gone = this.#listed.filter((item) => !readIds.has(item.id));
    const found = gone.length === 0 ? [] : await lookUp(gone);
    const stillOpen: InboxItem[] = [];
    for (const item of gone) {
      const current = found.find((each) => each.id === item.id);
      if (current?.state.kind === "open") {
        stillOpen.push(current);
        continue;
      }
      this.#ended.set(item.id, current ?? { ...item, state: missedState(now) });
    }
    const listed = [...read, ...stillOpen];
    // An item listed again waits again, so it is no longer an ended one.
    for (const item of listed) this.#ended.delete(item.id);
    this.#listed = listed;
    this.#forgetOld(now);
    return [...listed, ...this.#ended.values()];
  }

  /** Forgets the items that ended more than a day ago, then all but the newest {@link endedKeptMax}. */
  #forgetOld(now: Date): void {
    const since = now.getTime() - endedKeptMs;
    const kept = [...this.#ended.values()]
      .filter((item) => Date.parse(endedAt(item.state)) >= since)
      .sort((a, b) => Date.parse(endedAt(b.state)) - Date.parse(endedAt(a.state)))
      .slice(0, endedKeptMax);
    this.#ended = new Map(kept.map((item) => [item.id, item]));
  }
}

function missedState(now: Date): InboxItemState {
  return { kind: "closed", reason: "cancelled", closedAt: now.toISOString() };
}

/** When an item that no longer waits ended. */
function endedAt(state: InboxItemState): string {
  if (state.kind === "answered") return state.answeredAt;
  if (state.kind === "closed") return state.closedAt;
  return "";
}
