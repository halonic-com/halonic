// What the parent and a run's worker say to each other over the worker's
// message port, the only channel between them (ADR 2.2). The parent sends
// one request; the worker answers `started`, then one result. Both cross as
// JSON text, so only plain data reaches the worker, and the parent measures
// and checks what comes back itself instead of trusting the worker (S16).

import {
  type ToolScriptData,
  type ToolScriptIsolateResult,
  type ToolScriptLimits,
  toolScriptMessageCharacters,
  toolScriptReasons,
} from "@halonicjs/ports";
import { parse, s } from "@halonicjs/schema-kit";

/** The one message the parent sends a run's worker. */
export interface WorkerRequest {
  readonly runId: string;
  readonly code: string;
  /** `ctx.input` as JSON text, already checked to be plain data within `limits.inputBytes`. */
  readonly input: string;
  readonly limits: ToolScriptLimits;
}

/** The worker has the request and starts the run: the parent's timers start now. */
export const startedMessage = "started";

/** The result message: the worker's `ToolScriptIsolateResult` as JSON text. */
export interface WorkerResultMessage {
  readonly result: string;
}

const workerResultMessage = s.object({ result: s.string() });

const plainData = s.json();

const logLines = (limits: ToolScriptLimits) =>
  s.array(s.string().max(limits.logLineCharacters)).max(limits.logLines);

const resultShape = (limits: ToolScriptLimits) =>
  s.discriminatedUnion("ok", [
    s.object({ ok: s.literal(true), output: plainData, log: logLines(limits) }),
    s.object({
      ok: s.literal(false),
      reason: s.enum(toolScriptReasons),
      message: s.string().max(toolScriptMessageCharacters).optional(),
      log: logLines(limits),
    }),
  ]);

/**
 * The result a worker's message stands for, checked by the parent: plain
 * data no larger than `limits.outputBytes` as UTF-8 JSON, measured here, or
 * a listed reason with a short message. Anything else is `toolscript.failed`.
 * The limits reported are the parent's own, never the worker's.
 */
export function checkedResult(message: unknown, limits: ToolScriptLimits): ToolScriptIsolateResult {
  const envelope = parse(workerResultMessage, message);
  if (!envelope.ok) return failed(limits);
  // The longest a well-formed result can be, so a huge text is refused before it's parsed.
  if (envelope.value.result.length > resultCharactersAtMost(limits)) return failed(limits);
  const parsed = parsedJson(envelope.value.result);
  if (!parse(resultShape(limits), parsed).ok) return failed(limits);
  // Checked above; read from `parsed` itself, since the checked copy would assign an own
  // `__proto__` key instead of keeping it as data.
  const result = parsed as WorkerResult;
  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason,
      ...(result.message === undefined ? {} : { message: result.message }),
      log: result.log,
      limits,
    };
  }
  if (utf8Bytes(JSON.stringify(result.output)) > limits.outputBytes) {
    return { ok: false, reason: "limit.output", log: result.log, limits };
  }
  return { ok: true, output: result.output, log: result.log, limits };
}

/** A run that failed for a reason of the parent's own, with no log. */
export function failedRun(
  reason: "toolscript.failed" | "toolscript.cancelled" | "limit.cpu" | "limit.wall-clock",
  limits: ToolScriptLimits,
  message?: string,
): ToolScriptIsolateResult {
  return { ok: false, reason, ...(message === undefined ? {} : { message }), log: [], limits };
}

type WorkerResult =
  | { ok: true; output: ToolScriptData; log: string[] }
  | {
      ok: false;
      reason: (typeof toolScriptReasons)[number];
      message?: string;
      log: string[];
    };

function failed(limits: ToolScriptLimits): ToolScriptIsolateResult {
  return failedRun("toolscript.failed", limits);
}

/**
 * Generous on purpose: JSON may escape each log character as up to six
 * (`\uXXXX`), and 4 KiB covers the fields and a message.
 */
function resultCharactersAtMost(limits: ToolScriptLimits): number {
  return limits.outputBytes * 6 + limits.logLines * (limits.logLineCharacters * 6 + 4) + 4096;
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The size of `text` as UTF-8. */
export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}
