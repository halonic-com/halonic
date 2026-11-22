/**
 * Which sessions the gateway client watches, and what it holds of each
 * (tunnel D7, design on HAL-15159, section 2). It watches the running and
 * waiting sessions, up to the protocol's 16, in the host's order, and stops
 * watching one that ends or leaves the list. It holds what it saw of a
 * session for as long as the session is listed, so a reconnect resumes the
 * watch from the last `seq` it holds.
 */

import { type GatewayHostMessage, type GatewaySession, gatewayMaxWatches } from "@halonicjs/ports";
import type { RemoteRefusal } from "./remote-view.ts";
import { type AddResult, SessionMemory } from "./session-memory.ts";

/** What to send after a session list: unwatch first, so the host's 16 are never passed. */
export interface WatchPlan {
  readonly unwatch: readonly string[];
  readonly watch: readonly string[];
}

/** The sessions watched in the open session, and the plan to keep them in step with the list. */
export class Watches {
  /** Watched in the open session, or asked to be. */
  private readonly watched = new Set<string>();

  /** What the phone holds of each listed session, shared with the view. */
  private readonly memories: Map<string, SessionMemory>;

  constructor(memories: Map<string, SessionMemory>) {
    this.memories = memories;
  }

  /**
   * What to watch and unwatch now that the host listed `sessions`. It
   * forgets what it held of a session that left the list, and of one whose
   * listed `lastSeq` is below what it holds, since a watch may not resume
   * after the session's last event.
   */
  plan(sessions: readonly GatewaySession[]): WatchPlan {
    const listed = new Map(sessions.map((session) => [session.id, session]));
    for (const [sessionId, memory] of this.memories) {
      const session = listed.get(sessionId);
      if (session === undefined) this.memories.delete(sessionId);
      else if (memory.lastSeq > session.lastSeq) memory.clear();
    }
    const wanted = sessions
      .filter((session) => session.state === "running" || session.state === "waiting")
      .slice(0, gatewayMaxWatches)
      .map((session) => session.id);
    return {
      unwatch: [...this.watched].filter((sessionId) => !wanted.includes(sessionId)),
      watch: wanted.filter((sessionId) => !this.watched.has(sessionId)),
    };
  }

  /** Marks `sessionId` watched; returns the `seq` to resume after. */
  watching(sessionId: string): number {
    this.watched.add(sessionId);
    const memory = this.memories.get(sessionId) ?? new SessionMemory();
    this.memories.set(sessionId, memory);
    return memory.lastSeq;
  }

  /**
   * The host confirmed a watch. Events from here on belong to it, so a
   * session watched again after a gap or `history-gone` takes events again.
   */
  confirmed(sessionId: string): void {
    this.memories.get(sessionId)?.watchConfirmed();
  }

  /**
   * The host refused a watch. After `history-gone` the phone drops what it
   * holds and returns `true`: watch again, from 0. Otherwise the session
   * stays unwatched until the next list.
   */
  refused(sessionId: string, code: RemoteRefusal): boolean {
    if (code === "history-gone") {
      this.memories.get(sessionId)?.startOver();
      return true;
    }
    this.watched.delete(sessionId);
    return false;
  }

  /** The host stopped a watch. */
  unwatched(sessionId: string): void {
    this.watched.delete(sessionId);
  }

  /** The connection dropped, and every watch with it. */
  dropped(): void {
    this.watched.clear();
  }

  /**
   * Takes one event. One of a session the phone doesn't watch (it may still
   * have been on its way after an `unwatch`) is `unwatched` and changes
   * nothing.
   */
  eventArrived(message: Extract<GatewayHostMessage, { type: "event" }>): AddResult | "unwatched" {
    const memory = this.memories.get(message.sessionId);
    if (!this.watched.has(message.sessionId) || memory === undefined) return "unwatched";
    return memory.add({ seq: message.seq, at: message.at, body: message.body });
  }
}
