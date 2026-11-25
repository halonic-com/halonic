// The owner's routes to the served workspace's routines (`server.routines`):
// their health, and pausing or resuming them, as the desktop's tray does
// over the engine role's control pipe (`agent-host.engine-routine-pause`).

import { errorResponse, serverErrors } from "./errors.ts";
import type { RoutineSchedule } from "./routine-schedule-api.ts";
import { isJsonRequest } from "./run-routes.ts";

/** `GET` gives the routines' health. */
export const routineHealthPath = "/api/routines/health";

/** `PUT` with `{ "paused": true }` or `{ "paused": false }` pauses or resumes the routines. */
export const routinePausePath = "/api/routines/pause";

/** Whether the address is one of the routine routes, which all need a session. */
export function isRoutineSchedulePath(pathname: string): boolean {
  return pathname === routineHealthPath || pathname === routinePausePath;
}

/**
 * Answers a routine route once the caller has checked the sign-in: the
 * health, or a pause or resume; 404 for another method.
 */
export function routineScheduleRoute(
  schedule: RoutineSchedule,
  request: Request,
  pathname: string,
  body: Uint8Array,
): Response {
  if (request.method === "GET" && pathname === routineHealthPath) {
    return Response.json(schedule.health());
  }
  if (request.method !== "PUT" || pathname !== routinePausePath) {
    return errorResponse(serverErrors.notFound);
  }
  // A cross-site form can only send a non-JSON type, so it never pauses the routines.
  if (!isJsonRequest(request)) {
    return errorResponse(serverErrors.unsupportedMediaType);
  }
  const paused = pausedOf(body);
  if (paused === null) {
    return errorResponse(serverErrors.badRequest);
  }
  schedule.pause(paused);
  return Response.json(schedule.health());
}

/** The body's `paused`, when the body is exactly `{ "paused": true | false }`; `null` otherwise. */
function pausedOf(body: Uint8Array): boolean | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const keys = Object.keys(parsed);
  const { paused } = parsed as { paused?: unknown };
  if (keys.length !== 1 || typeof paused !== "boolean") return null;
  return paused;
}
