import type { Clock, Coordination } from "@halonicjs/ports";
import { lastTickKey } from "./routine-ids.ts";

/** What {@link passRoutineTick} works with: the same as the workspace's `RoutineScheduler`. */
export interface RoutinePassOptions {
  /** The workspace's id, as the scheduler has it. */
  readonly workspaceId: string;
  readonly clock: Clock;
  readonly coordination: Coordination;
}

/**
 * A tick that starts nothing, for a host whose user paused the workspace's
 * routines: it stores the clock's time as the last tick, so the scheduler's
 * first tick after the pause skips the times that fell due during it instead
 * of catching them up. Times queued before the pause stay queued. A stored
 * tick at or after now stays, and so does one another tick stored meanwhile.
 *
 * @returns whether it stored the time
 */
export async function passRoutineTick(options: RoutinePassOptions): Promise<boolean> {
  const key = lastTickKey(options.workspaceId);
  const now = options.clock.now();
  const stored = await options.coordination.read(key);
  if (stored !== null && new Date(stored).getTime() >= now.getTime()) {
    return false;
  }
  return await options.coordination.compareAndSet(key, stored, now.toISOString());
}
