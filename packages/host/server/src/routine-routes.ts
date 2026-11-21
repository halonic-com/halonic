import { CronError, nextRun, type PlacedRoutine, routineKey } from "@halonicjs/routines";
import type { ServerPorts } from "./api.ts";
import type {
  EngineRoutines,
  RoutineListBody,
  RoutineListEntry,
  RoutineRunBody,
} from "./engine-api.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { routineStartOrRefusal, startRoutineRun } from "./routine-run-start.ts";
import { isJsonRequest } from "./run-routes.ts";
import { refuseUnlessTrusted, startFailureResponse } from "./trust-routes.ts";

/** The engine role's two routine routes; see `engine-api.ts` for their shapes. */
export interface RoutineRoutes {
  /** `GET /api/routines`: every routine, with when it next starts on its own. */
  list(): Promise<Response>;
  /**
   * `POST /api/routines/<scope>/<routine>/run`: Run now.
   *
   * @param scope the hub's id, or `@workspace`
   */
  runNow(request: Request, scope: string, routine: string, body: Uint8Array): Promise<Response>;
}

/** What the routine routes need from the engine. */
export type RoutineRoutePorts = Pick<ServerPorts, "runs" | "trust" | "clock"> & {
  readonly routines: EngineRoutines;
};

/** One part of a routine's key, as a webhook address takes it. */
const keySegment = /^[@A-Za-z0-9._-]{1,128}$/;

/**
 * Builds the engine role's routine routes. They don't check the launch token
 * themselves: `createEngineServer` does that before any route runs. Run now asks
 * the trust gate on every call, before it reads a routine.
 */
export function createRoutineRoutes(ports: RoutineRoutePorts): RoutineRoutes {
  const { routines, runs, trust, clock } = ports;

  return {
    async list() {
      const now = clock.now();
      const entries = (await routines.list()).map(
        (placed): RoutineListEntry => ({
          key: routineKey(placed),
          hubId: placed.hub,
          id: placed.routine.id,
          name: placed.routine.name,
          enabled: placed.routine.enabled,
          nextRun: nextRunOf(placed, now, routines.timeZone),
        }),
      );
      const body: RoutineListBody = { routines: entries };
      return Response.json(body);
    },

    async runNow(request, scope, routine, body) {
      const refused = refuseRunNowRequest(request, [scope, routine], body);
      if (refused !== null) {
        return refused;
      }
      // Trust first, so a caller learns nothing about the routines of a workspace that may not run.
      const untrusted = await refuseUnlessTrusted(trust);
      if (untrusted !== null) {
        return untrusted;
      }
      const key = `${scope}/${routine}`;
      const placed = (await routines.list()).find((each) => routineKey(each) === key);
      if (placed === undefined) {
        return errorResponse(serverErrors.routineNotFound);
      }
      if (!placed.routine.enabled) {
        return errorResponse(serverErrors.routineOff);
      }
      const at = clock.now();
      // A manual start has no earlier run to name, so `{{trigger.lastRun}}` is null.
      const start = routineStartOrRefusal(placed, { at, lastRun: null });
      if (start instanceof Response) {
        return start;
      }
      // A routine at the workspace root that names no hub has nowhere to run, as if its hub were gone.
      if (start.hub === null) {
        return errorResponse(serverErrors.hubNotFound);
      }
      const trigger = { type: "manual", routineId: key, at: at.toISOString() } as const;
      try {
        const summary = await startRoutineRun(runs, start.hub, start, trigger);
        const answer: RoutineRunBody = { runId: summary.id };
        return Response.json(answer, { status: 201 });
      } catch (error) {
        return startFailureResponse(error);
      }
    },
  };
}

/** When the routine next starts on its own, or `null` when it is off, has no clock or doesn't parse. */
function nextRunOf(placed: PlacedRoutine, now: Date, timeZone: string): string | null {
  if (!placed.routine.enabled) return null;
  try {
    return nextRun(placed.routine.trigger, now, timeZone)?.toISOString() ?? null;
  } catch (error) {
    if (error instanceof CronError) return null;
    throw error;
  }
}

/** The answer to a Run now request that can't be one, before anything is read; `null` when it may go on. */
function refuseRunNowRequest(
  request: Request,
  keyParts: readonly string[],
  body: Uint8Array,
): Response | null {
  if (!keyParts.every((part) => keySegment.test(part))) {
    return errorResponse(serverErrors.routineNotFound);
  }
  if (!isJsonRequest(request)) {
    return errorResponse(serverErrors.unsupportedMediaType);
  }
  // Run now takes no options: a client that thinks it set one would be wrong, so any field is refused.
  return isEmptyObject(body) ? null : errorResponse(serverErrors.badRequest);
}

function isEmptyObject(body: Uint8Array): boolean {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length === 0
    );
  } catch {
    return false;
  }
}
