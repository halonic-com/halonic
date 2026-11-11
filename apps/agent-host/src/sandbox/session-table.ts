import { randomUUID } from "node:crypto";
import type { SandboxSession } from "@halonicjs/ports";

/**
 * The sandbox sessions the host has open, by an id it made. The caller names
 * a session by that id in later requests; an id the host didn't make finds
 * nothing.
 */
export class SessionTable {
  private readonly sessions = new Map<string, SandboxSession>();
  private readonly closeListeners = new Map<string, Set<() => void>>();

  /** Keeps `session` and returns its new id. */
  add(session: SandboxSession): string {
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
   * Closes the session and forgets it.
   *
   * @returns false when there is no session with this id
   */
  async close(id: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (session === undefined) return false;
    this.sessions.delete(id);
    const listeners = this.closeListeners.get(id) ?? new Set();
    this.closeListeners.delete(id);
    await session.close();
    for (const listener of listeners) listener();
    return true;
  }

  /** Closes every session, when the host stops. */
  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)));
  }
}
