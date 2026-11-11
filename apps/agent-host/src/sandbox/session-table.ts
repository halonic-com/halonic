import { randomUUID } from "node:crypto";
import type { SandboxSession } from "@halonicjs/ports";

/** How many sessions the host keeps open at once, opening ones included. */
export const defaultMaxSessions = 64;

interface OpenSession {
  session: SandboxSession;
  closeListeners: Set<() => void>;
  /** Closes the session through the table when its time limit runs out. */
  timer: ReturnType<typeof setTimeout>;
}

/**
 * The sandbox sessions the host has open, by an id it made. The caller names
 * a session by that id in later requests; an id the host didn't make finds
 * nothing.
 *
 * A session ends by itself when its time limit runs out; the table then
 * closes it too, so it forgets the id and ends the streams waiting on it. The
 * table keeps at most `maxSessions` sessions, counting those still opening
 * (see {@link SessionTable.reserve}).
 *
 * Once {@link SessionTable.closeAll} has started, the host is stopping and the
 * table takes no new session: one that was still opening then is closed as it
 * arrives, so none outlives the host.
 */
export class SessionTable {
  private readonly sessions = new Map<string, OpenSession>();
  private readonly maxSessions: number;
  private reserved = 0;
  private stopping = false;

  constructor(options: { maxSessions?: number } = {}) {
    this.maxSessions = options.maxSessions ?? defaultMaxSessions;
  }

  /** True once {@link SessionTable.closeAll} has started. */
  get isStopping(): boolean {
    return this.stopping;
  }

  /**
   * Takes a place for a session about to open, so that sessions opening at
   * the same time can't go past the limit together. Call the returned
   * function once the session is added, or failed to open; calling it twice
   * frees one place only.
   *
   * @returns undefined when the table is full
   */
  reserve(): (() => void) | undefined {
    if (this.sessions.size + this.reserved >= this.maxSessions) return undefined;
    this.reserved += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.reserved -= 1;
    };
  }

  /**
   * Keeps `session` and returns its new id. Once the host is stopping, closes
   * the session instead.
   *
   * @returns undefined when the host is stopping and the session was closed
   */
  async add(session: SandboxSession): Promise<string | undefined> {
    if (this.stopping) {
      await closeQuietly(session);
      return undefined;
    }
    const id = randomUUID();
    // The session has ended by itself by then (its limit counts from a little
    // earlier, when it began to open): closing it here only tidies up.
    const timer = setTimeout(
      () => void this.close(id).catch(() => undefined),
      session.profile.timeLimitMs,
    );
    timer.unref();
    this.sessions.set(id, { session, closeListeners: new Set(), timer });
    return id;
  }

  get(id: string): SandboxSession | undefined {
    return this.sessions.get(id)?.session;
  }

  /**
   * Calls `listener` once when the session with this id is closed through the
   * table. Returns a function that stops listening.
   */
  onClosed(id: string, listener: () => void): () => void {
    const listeners = this.sessions.get(id)?.closeListeners;
    listeners?.add(listener);
    return () => listeners?.delete(listener);
  }

  /**
   * Closes the session and forgets it. The close listeners run even when the
   * session fails to close, so nothing keeps waiting for it.
   *
   * @returns false when there is no session with this id
   * @throws what the session's own `close` throws
   */
  async close(id: string): Promise<boolean> {
    const open = this.sessions.get(id);
    if (open === undefined) return false;
    this.sessions.delete(id);
    clearTimeout(open.timer);
    try {
      await open.session.close();
    } finally {
      for (const listener of open.closeListeners) listener();
    }
    return true;
  }

  /**
   * Closes every session, when the host stops, and takes no new one after.
   * A session that fails to close doesn't stop the others, or the host.
   */
  async closeAll(): Promise<void> {
    this.stopping = true;
    await Promise.allSettled([...this.sessions.keys()].map((id) => this.close(id)));
  }
}

/** Closes a session nobody can name any more: there is no one to tell if it fails. */
async function closeQuietly(session: SandboxSession): Promise<void> {
  try {
    await session.close();
  } catch {
    // The host is stopping and no request waits for this session: nothing more to do.
  }
}
