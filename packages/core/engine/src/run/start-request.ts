// A run's start as the local executor gets it: the checks it passes before
// anything is recorded, and the `start` input it is recorded with.

import { AGENT_HARNESSES, type Workflow } from "@halonicjs/format";
import type { StartRunRequest } from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";
import { missingStartFields } from "@halonicjs/workflow";
import type { StartInput } from "../kernel/decide-types.ts";
import { InputRefused } from "../kernel/input-refused.ts";

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

/**
 * Refuses a run whose input lacks a field the workflow's first step reads,
 * so a routine or any other start doesn't give its agent `(not set)` (HAL-14777).
 * A test run is not checked: its test says what the input is.
 *
 * @throws InputRefused `engine.input-missing-field` naming the fields and the step
 */
export function checkStartInput(request: StartRunRequest, workflow: Workflow): void {
  const lacks =
    request.kind === "test" ? null : missingStartFields(workflow, Object.keys(request.input));
  if (lacks === null) return;
  const fields = `${lacks.missing.length === 1 ? "field" : "fields"} ${lacks.missing.join(", ")}`;
  const message = `The input has no ${fields}, which the step ${lacks.step} reads.`;
  throw new InputRefused("engine.input-missing-field", message);
}

/** The `start` input a top-level run is recorded with. */
export function startInputOf(
  request: StartRunRequest,
  runId: string,
  definitionsVersion: string,
  at: string,
): StartInput {
  const { hubId, workflowId, input, trigger, harness, cantTry = [], version } = request;
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
    ...(version === undefined ? {} : { version }),
  };
}
