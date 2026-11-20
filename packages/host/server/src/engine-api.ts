import type { PlacedRoutine } from "@halonicjs/routines";

/**
 * The two routine routes of the engine role (B1, design note D3), next to the
 * run routes. `serve` doesn't mount them.
 *
 * - `GET /api/routines` answers a {@link RoutineListBody}: every routine of
 *   the workspace as it is in the files now, with the next time it starts on
 *   its own.
 * - `POST /api/routines/<routine key>/run` (Run now) starts the routine's
 *   workflow or agent now, also while the routine is off, as a `manual`
 *   trigger with the routine's key. The key is `routineKey`'s:
 *   `<hubId>/<routineId>`, or `@workspace/<routineId>` at the workspace root,
 *   each part one address segment. The body is `{}`, sent as
 *   `application/json`. It answers a {@link RoutineRunBody}, or a
 *   `ServerErrorBody`: `workspace_not_trusted` (403), `routine_not_found`
 *   (404), `hub_not_found`, `workflow_not_found` or `agent_not_found` (404)
 *   when its target is gone, `routine_has_no_hub` (409) when a routine at the
 *   workspace root names no hub to run in.
 *
 * Both need the launch token, like every route of the engine role.
 */
export interface EngineRoutines {
  /**
   * Every routine file of the workspace, each with its hub, read again on
   * every call so an edited, added or switched-off routine counts at once. A
   * file that didn't parse isn't among them.
   */
  list(): Promise<readonly PlacedRoutine[]>;
  /**
   * The zone a schedule that names none is read in: the computer's own,
   * which only the host can tell.
   */
  readonly timeZone: string;
}

/** One routine as `GET /api/routines` lists it. Nothing here is a secret. */
export interface RoutineListEntry {
  /** The routine's key, as Run now's address and a run's `trigger.routineId` name it. */
  readonly key: string;
  /** The hub it sits in, or `null` at the workspace root. */
  readonly hubId: string | null;
  /** Its id inside the hub: the file's name. */
  readonly id: string;
  readonly name: string;
  /** Whether it starts on its own; Run now works either way. */
  readonly enabled: boolean;
  /**
   * When it next starts on its own, as an ISO time; `null` when it is off,
   * its trigger isn't a clock (manual, mail, signal, webhook), or its
   * schedule doesn't parse.
   */
  readonly nextRun: string | null;
}

/** What `GET /api/routines` answers. */
export interface RoutineListBody {
  /** In the workspace's order: hub by hub, then by file name. */
  readonly routines: readonly RoutineListEntry[];
}

/** What `POST /api/routines/<key>/run` answers when it started the routine's run. */
export interface RoutineRunBody {
  readonly runId: string;
}
