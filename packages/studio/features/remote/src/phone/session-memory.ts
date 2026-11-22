/**
 * What the phone holds of one watched session, in memory only (tunnel D7,
 * design on HAL-15159, section 3 and B7 item 10). It keeps the newest events
 * within a cap, so a host that streams without end can't grow the phone's
 * memory without limit, and it notices a gap in `seq`, after which the
 * gateway client drops what it holds and watches the session from 0. Until
 * the host confirms that new watch, events of the old one may still arrive,
 * so the memory ignores every event until then.
 *
 * The open approvals are kept apart from the events: an approval requested
 * long ago stays open after its event fell out of the cap.
 */

import type { GatewayApproval } from "@halonicjs/ports";
import type { RemoteEvent } from "./remote-view.ts";

/** The most events the phone holds of one session. */
export const maxHeldEvents = 500;

/** The most bytes of event text, in UTF-8, the phone holds of one session. */
export const maxHeldEventBytes = 1024 * 1024;

/** An approval of this session that waits for an answer. */
export interface HeldApproval {
  readonly approval: GatewayApproval;
  /** When it was requested, by the host's clock. */
  readonly requestedAt: string;
}

/**
 * What {@link SessionMemory.add} did with one event:
 *
 * - `held`: it is the next event, and the phone holds it;
 * - `gap`: one or more events before it are missing, so the phone dropped
 *   everything it held of the session, and must watch it from 0;
 * - `repeat`: the phone already had it (its `seq` is not above the last
 *   one), so nothing changed;
 * - `ignored`: the phone is watching the session again from 0 and the host
 *   hasn't confirmed that watch yet, so the event belongs to the old watch
 *   and nothing changed.
 */
export type AddResult = "held" | "gap" | "repeat" | "ignored";

interface HeldEvent {
  readonly event: RemoteEvent;
  readonly bytes: number;
}

const utf8 = new TextEncoder();

/** What the phone holds of one watched session: its newest events and its open approvals. */
export class SessionMemory {
  private held: HeldEvent[] = [];
  private heldBytes = 0;
  private dropped = false;
  private last: number | undefined;
  private waitingForWatch = false;
  private snapshot: readonly RemoteEvent[] | undefined;
  private readonly approvals = new Map<string, HeldApproval>();

  /**
   * The `seq` of the last event seen, for a watch that resumes after it; 0
   * when there is none, so the watch starts from the oldest event the host
   * keeps.
   */
  get lastSeq(): number {
    return this.last ?? 0;
  }

  /** The events held, oldest first; the same array until they change. */
  get events(): readonly RemoteEvent[] {
    this.snapshot ??= this.held.map((entry) => entry.event);
    return this.snapshot;
  }

  /** Whether older events were dropped to stay within the cap. */
  get droppedOlder(): boolean {
    return this.dropped;
  }

  /** The approvals requested and not settled since, oldest request first. */
  get openApprovals(): readonly HeldApproval[] {
    return [...this.approvals.values()];
  }

  /**
   * Takes the next event of a watch. The first event after {@link clear}
   * or {@link watchConfirmed} may have any `seq`, since the host keeps only
   * its newest events; after that each one must be one more than the last.
   */
  add(event: RemoteEvent): AddResult {
    if (this.waitingForWatch) return "ignored";
    if (this.last !== undefined && event.seq <= this.last) return "repeat";
    if (this.last !== undefined && event.seq !== this.last + 1) {
      this.startOver();
      return "gap";
    }
    this.last = event.seq;
    this.hold(event);
    this.follow(event);
    return "held";
  }

  /**
   * Drops everything held and ignores events until {@link watchConfirmed},
   * as after a gap or `history-gone`, when the client watches the session
   * again from 0.
   */
  startOver(): void {
    this.clear();
    this.waitingForWatch = true;
  }

  /**
   * The host confirmed the new watch with `ok`. It sends that before the
   * new watch's first event, so every event from here on belongs to it.
   */
  watchConfirmed(): void {
    this.waitingForWatch = false;
  }

  /** Drops everything held, and takes the next event as the session's first. */
  clear(): void {
    this.held = [];
    this.snapshot = undefined;
    this.heldBytes = 0;
    this.dropped = false;
    this.last = undefined;
    this.approvals.clear();
  }

  private hold(event: RemoteEvent): void {
    const bytes = utf8.encode(JSON.stringify(event.body)).byteLength;
    this.held.push({ event, bytes });
    this.snapshot = undefined;
    this.heldBytes += bytes;
    while (this.held.length > maxHeldEvents || this.heldBytes > maxHeldEventBytes) {
      const oldest = this.held.shift();
      if (oldest === undefined) break;
      this.heldBytes -= oldest.bytes;
      this.dropped = true;
    }
  }

  /** Keeps the open approvals in step, within the same count as the events. */
  private follow({ body, at }: RemoteEvent): void {
    if (body.type === "approval-settled") {
      this.approvals.delete(body.approvalId);
    } else if (body.type === "approval-requested") {
      this.approvals.delete(body.approval.id);
      this.approvals.set(body.approval.id, { approval: body.approval, requestedAt: at });
      const oldest = this.approvals.keys().next();
      if (this.approvals.size > maxHeldEvents && oldest.done !== true) {
        this.approvals.delete(oldest.value);
      }
    }
  }
}
