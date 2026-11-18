import {
  type RunnerStartGate,
  runnerUnfencedReasons,
  type UnfencedRunDecision,
  type UnfencedRuns,
} from "@halonicjs/app";
import { s } from "@halonicjs/schema-kit";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";

/**
 * What the routes need: the host's one start gate and the `UnfencedRuns` it
 * decides with, so a yes given here is the one every plugin start reads, and
 * Take back stops the runners those starts registered.
 */
export interface UnfencedRunsSource {
  readonly gate: Pick<RunnerStartGate, "status" | "allow">;
  readonly runs: Pick<UnfencedRuns, "takeBack">;
}

/** The reason the user ticked the box for, and nothing else. */
const allowBody = s.object({ reason: s.enum(runnerUnfencedReasons) }).strict();

/** Take back takes no input: there is one yes per profile. */
const emptyBody = s.object({}).strict();

/**
 * Whether plugin code may run without the sandbox, for Studio's trust check
 * and Settings › Agent sandbox (HAL-3384, the "Runs" line design on HAL-1873):
 *
 * - `GET /v1/unfenced-runs` answers what a start would decide now (see
 *   `RunnerStartGate.status`), as codes only. It isn't free of effects: like
 *   every start, it removes the saved yes once the computer is in the
 *   sandbox, so a later failure asks again. That is intended (I5 design
 *   4.3.1, "call it at start-up too"); don't make it read-only;
 * - `POST /v1/unfenced-runs/allow` with `{ reason }` saves the user's yes
 *   through the gate, which saves nothing unless `reason` is the current one
 *   (409 `reason_changed`). Nothing here saves a yes any other way;
 * - `POST /v1/unfenced-runs/take-back` with `{}` removes the yes and stops
 *   every plugin runner this host started without the sandbox before it
 *   answers.
 *
 * Errors of the saved yes stay in the host: `log` gets their code, never a
 * path, and the answer a fixed message.
 */
export function unfencedRunsRoutes(
  source: UnfencedRunsSource,
  log: (text: string) => void,
): HostRoute[] {
  return [
    {
      method: "GET",
      path: "/v1/unfenced-runs",
      handle: async (_request, response) => {
        try {
          sendJson(response, 200, answerOf(await source.gate.status(), log));
        } catch (error) {
          log(
            `The agent host couldn't read whether plugins may run without the sandbox: ${errorText(error)}\n`,
          );
          sendError(response, 500, "unfenced_status_failed", "The status couldn't be read.");
        }
      },
    },
    {
      method: "POST",
      path: "/v1/unfenced-runs/allow",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, allowBody);
        if (body === undefined) return;
        try {
          const allowed = await source.gate.allow(body.reason);
          if (allowed === null) {
            sendError(response, 409, "reason_changed", "The reason isn't the current one.");
            return;
          }
          sendJson(response, 200, allowed);
        } catch (error) {
          log(
            `The agent host couldn't save the yes for running without the sandbox: ${errorText(error)}\n`,
          );
          sendError(response, 500, "allow_failed", "The yes couldn't be saved.");
        }
      },
    },
    {
      method: "POST",
      path: "/v1/unfenced-runs/take-back",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, emptyBody);
        if (body === undefined) return;
        try {
          await source.runs.takeBack();
          sendJson(response, 200, { takenBack: true });
        } catch (error) {
          sendTakeBackError(response, error, log);
        }
      },
    },
  ];
}

/** The decision as codes: the store's error, when there is one, goes to `log` and never into the answer. */
function answerOf(decision: UnfencedRunDecision, log: (text: string) => void): unknown {
  if (decision.run !== "needs-yes") return decision;
  if ("error" in decision) {
    log(
      `The agent host couldn't read the saved yes for running without the sandbox: ${errorText(decision.error)}\n`,
    );
  }
  return { run: "needs-yes", reason: decision.reason };
}

/**
 * A Take back that stopped only some runners still removed the yes: it
 * answers `take_back_incomplete`. One that couldn't remove the yes answers
 * `take_back_failed`, and nothing was stopped.
 */
function sendTakeBackError(
  response: Parameters<HostRoute["handle"]>[1],
  error: unknown,
  log: (text: string) => void,
): void {
  if (error instanceof AggregateError) {
    log(`The agent host couldn't stop ${error.errors.length} plugin runners on Take back.\n`);
    sendError(response, 500, "take_back_incomplete", "Some plugins didn't stop.");
    return;
  }
  log(`The agent host couldn't take the yes back: ${errorText(error)}\n`);
  sendError(response, 500, "take_back_failed", "The yes couldn't be taken back.");
}

/** A failure's code or name, never its message: file errors carry the path. */
function errorText(error: unknown): string {
  if (error instanceof Error && "code" in error) return String(error.code);
  return error instanceof Error ? error.name : "unknown error";
}
