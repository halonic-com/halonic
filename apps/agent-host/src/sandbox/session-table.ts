import { randomUUID } from "node:crypto";
import type { SandboxSession } from "@halonicjs/ports";

/**
 * The sandbox sessions the host has open, by an id it made. The caller names
 * a session by that id in later requests; an id the host didn't make finds
 * nothing.
 *
 * Once {@link SessionTable.closeAll} has started, the host is stopping and the
 * table takes no new session: one that was still opening then is closed as it
 * arrives, so none outlives the host.
 */
export class SessionTable {
  private readonly sessions = new Map<string, SandboxSession>();
  private readonly closeListeners = new Map<string, Set<() => void>>();
  private stopping = false;

  /** True once {@link SessionTable.closeAll} has started. */
  get isStopping(): boolean {
    return this.stopping;
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
    this.sessions.set(id, session);
    this.closeListeners.set(id, new Set());
    return id;
  }

  get(id: string): SandboxSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Calls `listener` once when the session with this id is closed through the
   * table. Returns a function that stops listening.
   */
  onClosed(id: string, listener: () => void): () => void {
    const listeners = this.closeListeners.get(id);
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
    const session = this.sessions.get(id);
    if (session === undefined) return false;
    this.sessions.delete(id);
    const listeners = this.closeListeners.get(id) ?? new Set();
    this.closeListeners.delete(id);
    try {
      await session.close();
    } finally {
      for (const listener of listeners) listener();
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
