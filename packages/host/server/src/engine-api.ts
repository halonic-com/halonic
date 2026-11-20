import type { RunStatus } from "@halonicjs/events";
import type { PlacedRoutine } from "@halonicjs/routines";

/**
 * The engine role's own routes (B1, design note D3, revision 3), next to the
 * run routes. `serve` doesn't mount them.
 *
 * - `GET /api/hello` answers an {@link EngineHelloBody}: only the run
 *   executor version, which `executor-remote`'s `send` with `wait` reads. It
 *   is not `serve`'s hello, which names the product.
 * - `GET /api/routines` answers a {@link RoutineListBody}: every routine of
 *   the workspace as it is in the files now, with the next time it starts on
 *   its own.
 * - `POST /api/routines/<routine key>/run` (Run now) starts the routine's
 *   workflow or agent now. The engine records the trigger itself, on its own
 *   clock: `{ type: "manual", routineId: <routine key>, at: <now> }`. The key
 *   is `routineKey`'s: `<hubId>/<routineId>`, or `@workspace/<routineId>` at
 *   the workspace root, each part one address segment. The body is `{}`, sent
 *   as `application/json`. It answers 201 with a {@link RoutineRunBody}, or a
 *   `ServerErrorBody` whose code is a {@link RoutineRunRefusal}.
 * - `GET /api/run-updates` is a server-sent event stream: one `changed` event
 *   per run summary change, its data a {@link RunUpdateFrame}. There is no
 *   `Last-Event-ID` resume and no replay: on every connect and reconnect the
 *   page reads all runs once, then follows the stream.
 *
 * Every one needs the launch token, like every route of the engine role.
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
  /** Whether it starts on its own. Run now refuses a routine that is off. */
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

/** What `POST /api/routines/<key>/run` answers, with 201, when it started the routine's run. */
export interface RoutineRunBody {
  readonly runId: string;
}

/**
 * Why Run now started nothing, as the `ServerErrorBody` code:
 * `workspace_not_trusted` (403), `routine_not_found` (404) when no routine
 * file has the key, `routine_off` (409) when the routine is switched off.
 * A routine whose workflow, agent or hub is gone gets the run start's own
 * 404 (`hub_not_found`, `workflow_not_found`, `agent_not_found`).
 */
export type RoutineRunRefusal = "workspace_not_trusted" | "routine_not_found" | "routine_off";

/** What the engine's `GET /api/hello` answers: nothing else, no product name or version. */
export interface EngineHelloBody {
  /** The `RunExecutor` port version the engine honors, `runExecutorVersion` from `@halonicjs/ports`. */
  readonly runExecutorVersion: number;
}

/**
 * The data of one `changed` event on `GET /api/run-updates`. Only these
 * three fields: no step data, input or output; the page reads the rest
 * through the run routes.
 */
export interface RunUpdateFrame {
  readonly runId: string;
  readonly status: RunStatus;
  /**
   * The `seq` of the run's latest event the change counts, so the page can
   * drop a frame it has already seen. It is not a stream position.
   */
  readonly seq: number;
}
