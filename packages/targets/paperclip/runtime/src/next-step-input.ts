import type { MonitorPolicy } from "./host.ts";
import { isTaskRef, readTask, ToolInputError } from "./task-input.ts";

/**
 * The rules of `paperclip.next-step` and `paperclip.finish-run`, ported from
 * `set_next_step` and `finish_run` in `tooling/paperclip` (HAL-16403) with
 * the same limits and wording: which task states each may leave, read from
 * the agent's parameters before anything reaches Paperclip. On a host with
 * `setDisposition`, Paperclip's own update route still has the last word
 * (HAL-16988, decision B). Pure, so tests need no host.
 */

/** The bounds of a monitor a tool sets, from the team's monitor rules (HAL-15308, HAL-16355). */
export const monitorLimits = {
  minMinutes: 15,
  maxMinutes: 24 * 60,
  defaultChecks: 4,
  maxChecks: 8,
} as const;

/** The longest comment either tool posts with its change, as for `comment`. */
export const maxNextStepComment = 20_000;

/** A monitor as the agent asks for it: when, on what, and how many checks. */
export interface MonitorRequest {
  readonly inMinutes: number;
  readonly ref: string;
  readonly service: string;
  readonly maxChecks: number;
}

/** What `set_next_step` changes: keep working with a monitor, or wait on blockers. */
export type NextStep =
  | { readonly status: "in_progress"; readonly monitor: MonitorRequest }
  | { readonly status: "blocked"; readonly blockedBy: readonly string[] };

/** How `finish_run` ends the run on the task. */
export type RunOutcome =
  | { readonly outcome: "done" }
  | { readonly outcome: "handoff"; readonly to: string }
  | { readonly outcome: "blocked"; readonly blockedBy: readonly string[] };

type Params = Readonly<Record<string, unknown>>;

function asParams(params: unknown): Params {
  return (params ?? {}) as Params;
}

function wholeNumber(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new ToolInputError(`${name} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

function shortText(value: unknown, name: string, example: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text === "" || text.length > 200) {
    throw new ToolInputError(`${name} must be a short text, such as ${example}.`);
  }
  return text;
}

/** The comment that goes with the change: required, and no longer than `comment` allows. */
export function readNextStepComment(params: unknown): string {
  const { comment } = asParams(params);
  if (typeof comment !== "string" || comment.trim() === "") {
    throw new ToolInputError("comment must say what happened and what comes next.");
  }
  if (comment.length > maxNextStepComment) {
    throw new ToolInputError(
      `comment is ${comment.length} characters; the most is ${maxNextStepComment}. Put a longer text in a document.`,
    );
  }
  return comment;
}

/** Where a monitor's four fields are read from, and the names refusals use for them. */
interface MonitorFields {
  readonly inMinutes: string;
  readonly ref: string;
  readonly service: string;
  readonly maxChecks: string;
}

const nestedMonitorNames: MonitorFields = {
  inMinutes: "monitor.inMinutes",
  ref: "monitor.ref",
  service: "monitor.service",
  maxChecks: "monitor.maxChecks",
};

/**
 * The monitor as flat parameters, for a tool file: its parameters can only be
 * plain values, never an object (`format.tool-file`).
 */
const flatMonitorKeys: MonitorFields = {
  inMinutes: "monitorInMinutes",
  ref: "monitorRef",
  service: "monitorService",
  maxChecks: "monitorMaxChecks",
};

function readMonitorFields(
  read: (key: keyof MonitorFields) => unknown,
  names: MonitorFields,
): MonitorRequest {
  const service = read("service");
  const maxChecks = read("maxChecks");
  return {
    inMinutes: wholeNumber(
      read("inMinutes"),
      names.inMinutes,
      monitorLimits.minMinutes,
      monitorLimits.maxMinutes,
    ),
    ref: shortText(read("ref"), names.ref, "halonic-com/halonic#5486"),
    service: service === undefined ? "github" : shortText(service, names.service, "github"),
    maxChecks:
      maxChecks === undefined
        ? monitorLimits.defaultChecks
        : wholeNumber(maxChecks, names.maxChecks, 1, monitorLimits.maxChecks),
  };
}

/** `monitor` as { inMinutes, ref, service?, maxChecks? }; throws for anything outside the bounds. */
export function readMonitor(value: unknown): MonitorRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ToolInputError(
      "monitor must be { inMinutes, ref, service?, maxChecks? }, such as { inMinutes: 20, ref: 'halonic-com/halonic#5486' }.",
    );
  }
  const monitor = value as Params;
  return readMonitorFields((key) => monitor[key], nestedMonitorNames);
}

/** Whether any of the flat `monitor…` fields is set. */
function hasFlatMonitor(params: Params): boolean {
  return Object.values(flatMonitorKeys).some((key) => params[key] !== undefined);
}

/** Whether the parameters ask for a monitor, as `monitor` or as any of the flat `monitor…` fields. */
function hasMonitor(params: Params): boolean {
  return params["monitor"] !== undefined || hasFlatMonitor(params);
}

/** The monitor from `monitor`, or from `monitorInMinutes`, `monitorRef`, `monitorService` and `monitorMaxChecks`; not both. */
function readMonitorParams(params: Params): MonitorRequest {
  if (params["monitor"] === undefined) {
    return readMonitorFields((key) => params[flatMonitorKeys[key]], flatMonitorKeys);
  }
  if (hasFlatMonitor(params)) {
    throw new ToolInputError(
      "give the monitor either as monitor or as monitorInMinutes and monitorRef, not both.",
    );
  }
  return readMonitor(params["monitor"]);
}

function blockedByList(value: unknown): readonly unknown[] {
  if (typeof value === "string") {
    return value.split(",");
  }
  return Array.isArray(value) ? value : [];
}

/**
 * `blockedBy` as one or more task identifiers or ids, without repeats: a list,
 * or one text with commas between them, as a tool file's parameter can only be.
 */
export function readBlockedBy(value: unknown): readonly string[] {
  const tasks = blockedByList(value).map((one) => (typeof one === "string" ? one.trim() : ""));
  if (tasks.length === 0 || tasks.length > 10 || !tasks.every(isTaskRef)) {
    throw new ToolInputError(
      "blockedBy must list 1 to 10 tasks that hold the work, such as ['HAL-16989'] or \"HAL-16989, HAL-17012\", never a parent epic.",
    );
  }
  return [...new Set(tasks)];
}

/** Handing a task on ends the calling run, so only `finish_run` may do it (HAL-16988, condition 5). */
function refuseHandoff(params: Params): void {
  for (const key of ["to", "assignee", "assigneeAgentId", "assigneeUserId"]) {
    if (params[key] !== undefined) {
      throw new ToolInputError(
        "set_next_step never hands a task on: call finish_run with outcome handoff as your run's last step.",
      );
    }
  }
}

/** `set_next_step`'s parameters: the task, its next state and the comment that explains it. */
export function readSetNextStepParams(params: unknown): {
  task: string;
  step: NextStep;
  comment: string;
} {
  const task = readTask(params);
  const read = asParams(params);
  refuseHandoff(read);
  const comment = readNextStepComment(params);
  if (read["status"] === "in_progress") {
    if (!hasMonitor(read)) {
      throw new ToolInputError(
        "in_progress needs a monitor: nothing else wakes you once this run ends.",
      );
    }
    return {
      task,
      comment,
      step: { status: "in_progress", monitor: readMonitorParams(read) },
    };
  }
  if (read["status"] === "blocked") {
    if (hasMonitor(read)) {
      throw new ToolInputError(
        "a blocked task's monitor never fires: name the blockers and leave out monitor.",
      );
    }
    return {
      task,
      comment,
      step: { status: "blocked", blockedBy: readBlockedBy(read["blockedBy"]) },
    };
  }
  throw new ToolInputError(
    "status must be in_progress (with a monitor) or blocked (with blockedBy). To finish, hand on or mark done, call finish_run.",
  );
}

/** `finish_run`'s parameters: the task, how the run ends and the comment that explains it. */
export function readFinishRunParams(params: unknown): {
  task: string;
  outcome: RunOutcome;
  comment: string;
} {
  const task = readTask(params);
  const read = asParams(params);
  const comment = readNextStepComment(params);
  switch (read["outcome"]) {
    case "done":
      return { task, comment, outcome: { outcome: "done" } };
    case "handoff":
      return {
        task,
        comment,
        outcome: { outcome: "handoff", to: shortText(read["to"], "to", "Liam") },
      };
    case "blocked":
      return {
        task,
        comment,
        outcome: { outcome: "blocked", blockedBy: readBlockedBy(read["blockedBy"]) },
      };
    default:
      throw new ToolInputError(
        "outcome must be done, handoff (with to) or blocked (with blockedBy).",
      );
  }
}

/**
 * The monitor policy for a request made at `now`; it gives up after its last check.
 * Paperclip keeps counting the checks a task's earlier monitors used (`checksUsed`) and refuses
 * a limit at or below that count, so the limit is the asked-for checks on top of them.
 */
export function monitorPolicy(request: MonitorRequest, now: Date, checksUsed = 0): MonitorPolicy {
  const minute = 60_000;
  const nextCheckAt = new Date(now.getTime() + request.inMinutes * minute);
  const timeoutAt = new Date(now.getTime() + request.inMinutes * (request.maxChecks + 1) * minute);
  return {
    nextCheckAt: nextCheckAt.toISOString(),
    notes: `Set with set_next_step: every ${request.inMinutes} minutes, at most ${request.maxChecks} checks.`,
    scheduledBy: "assignee",
    kind: "external_service",
    serviceName: request.service,
    externalRef: request.ref,
    timeoutAt: timeoutAt.toISOString(),
    maxAttempts: checksUsed + request.maxChecks,
  };
}
