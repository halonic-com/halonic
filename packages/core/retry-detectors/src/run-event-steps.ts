import type { AttemptStep } from "./attempt-step.ts";
import { turnStepTool } from "./attempt-step.ts";

/**
 * The part of a run log event the recorder reads. A writer's harness reports
 * tool calls as `tool.called` and the bridge reports each model answer as
 * `llm.response`; every other event type is left out of the steps.
 */
export interface WriterEvent {
  readonly type: string;
  /** For `tool.called`: the harness's own tool name. */
  readonly tool?: string;
  /** For `tool.called`: the arguments the model gave the tool. */
  readonly args?: unknown;
  /** For `llm.response`: the answer's token use. */
  readonly usage?: { readonly inputTokens: number; readonly outputTokens: number };
}

/** Tools whose `path` argument is a file they change. */
const editingTools = new Set(["edit", "write"]);

/**
 * Turns a writer attempt's run events into the steps the detectors read, as
 * they arrive. A model answer starts a new turn, and the tool calls after it
 * belong to that turn, as in variant-router's timelines.
 */
export class AttemptStepRecorder {
  readonly #startedAtMs: number;
  readonly #steps: AttemptStep[] = [];
  #turn = 0;

  /** @param startedAtMs - when the attempt started, in the clock `record` is given */
  constructor(startedAtMs: number) {
    this.#startedAtMs = startedAtMs;
  }

  /** Adds the step an event shows, if it shows one. */
  record(event: WriterEvent, atMs: number): void {
    const t = Math.max(0, (atMs - this.#startedAtMs) / 1000);
    if (event.type === "llm.response" && event.usage !== undefined) {
      this.#turn += 1;
      this.#steps.push({
        t,
        step: this.#turn,
        tool: turnStepTool,
        tokensIn: event.usage.inputTokens,
        tokensOut: event.usage.outputTokens,
      });
      return;
    }
    if (event.type === "tool.called" && event.tool !== undefined) {
      this.#steps.push(toolStep(t, Math.max(1, this.#turn), event.tool, event.args));
    }
  }

  /** The steps so far, oldest first. */
  steps(): readonly AttemptStep[] {
    return [...this.#steps];
  }
}

function toolStep(t: number, step: number, tool: string, args: unknown): AttemptStep {
  const path = stringField(args, "path") ?? stringField(args, "filePath");
  if (tool === "shell") {
    const command = stringField(args, "command");
    return command === undefined ? { t, step, tool } : { t, step, tool, command };
  }
  if (path === undefined) return { t, step, tool };
  if (editingTools.has(tool)) return { t, step, tool, edited: [path] };
  if (tool === "read") return { t, step, tool, read: [path] };
  return { t, step, tool };
}

function stringField(value: unknown, name: string): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const field = (value as Record<string, unknown>)[name];
  return typeof field === "string" ? field : undefined;
}
