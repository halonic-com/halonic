// A run's start as the local executor gets it: the checks it passes before
// anything is recorded, and the `start` input it is recorded with.

import { AGENT_HARNESSES } from "@halonicjs/format";
import type { StartRunRequest } from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";
import type { StartInput } from "../kernel/decide-types.ts";

/** The longest run id, in UTF-8 bytes, because it is a `Scheduler` key. */
const maxRunIdBytes = 256;

/**
 * Refuses a start the executor can't take, before it records or keeps anything.
 *
 * @throws RangeError when `runId` is longer than 256 UTF-8 bytes, or `harness` isn't a harness
 */
export function checkStartRequest(request: StartRunRequest): void {
  if (request.runId !== undefined && encodeUtf8(request.runId).length > maxRunIdBytes) {
    throw new RangeError(`A run id is at most ${maxRunIdBytes} UTF-8 bytes.`);
  }
  if (request.harness !== undefined && !AGENT_HARNESSES.includes(request.harness)) {
    const known = AGENT_HARNESSES.join(", ");
    throw new RangeError(`"${request.harness}" isn't a harness. The harnesses are ${known}.`);
  }
}

/** The `start` input a top-level run is recorded with. */
export function startInputOf(
  request: StartRunRequest,
  runId: string,
  definitionsVersion: string,
  at: string,
): StartInput {
  const { hubId, workflowId, input, trigger, harness, cantTry = [] } = request;
  return {
    type: "start",
    at,
    runId,
    hubId,
    workflowId,
    input,
    kind: request.kind ?? "run",
    definitionsVersion,
    ...(trigger === undefined ? {} : { trigger }),
    ...(harness === undefined ? {} : { harness }),
    cantTry,
  };
}
