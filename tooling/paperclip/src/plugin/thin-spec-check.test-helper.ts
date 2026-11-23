import type { PluginEvent } from "@paperclipai/plugin-sdk";
import { featureCount, type ThinSpecModel } from "../thin-spec/score.ts";
import { fakeMetrics, fakeState } from "./fake-host.test-helper.ts";
import { manifest } from "./manifest.ts";
import type { ThinSpecApi } from "./thin-spec-calls.ts";
import { thinSpecCheck } from "./thin-spec-check.ts";

/** A task as the fake host keeps it: only the fields the check reads. */
export interface FakeCheckedTask {
  id: string;
  identifier: string;
  companyId: string;
  title: string;
  description: string | null;
  status: string;
  assigneeAgentId: string | null;
  createdByAgentId: string | null;
  projectId: string | null;
  goalId: string | null;
  createdAt: string;
  labels: { id: string; name: string }[];
}

/** Made-up keys; the tests check they never show up in a log line or a metric. */
export const anthropicKey = "made-up-anthropic-key-4b8e";
export const paperclipKey = "made-up-paperclip-key-c51d";

/** The test clock. */
export const now = new Date("2026-11-23T12:00:00Z");

/** Settings with the check on for the running version. */
export const checkSwitchOn = {
  thinSpecCheckForVersion: manifest.version,
  thinSpecClarifier: "pm",
  taggerAnthropicKey: { type: "secret_ref", secretId: "secret-tagger" },
  paperclipApiUrl: "http://paperclip.test:3100",
  paperclipApiKey: { type: "secret_ref", secretId: "secret-paperclip" },
};

/**
 * A made-up model that reads only spec precision: a precision of 1 scores
 * 0.88 (flagged), 5 scores 0.0025 (clear).
 */
export const testModel: ThinSpecModel = {
  source: "test",
  mean: Array(featureCount).fill(0),
  scale: Array(featureCount).fill(1),
  weights: [-2, ...Array(featureCount - 1).fill(0)],
  intercept: 4,
};

/** A new D2 task Chief created for Mateo. */
export function checkedTask(changes: Partial<FakeCheckedTask> = {}): FakeCheckedTask {
  return {
    id: "task-1",
    identifier: "HAL-1",
    companyId: "acme",
    title: "Make the export faster",
    description: "It is slow.",
    status: "todo",
    assigneeAgentId: "agent-mateo",
    createdByAgentId: "agent-chief",
    projectId: "project-studio",
    goalId: "goal-1",
    createdAt: "2026-11-23T11:00:00Z",
    labels: [{ id: "label-D2", name: "D2" }],
    ...changes,
  };
}

/** Haiku's reading, as the schema asks for it, with this spec precision. */
export function reading(specPrecision: number): string {
  return JSON.stringify({
    spec_precision: specPrecision,
    ambiguity: 3,
    expected_files: 2,
    expected_packages: 1,
    change_kind: "fix",
    ui_vs_logic: "logic",
    needs_new_api_or_type: false,
    existing_tests_must_change: true,
    language: "typescript",
    risk_areas: ["none"],
    difficulty: 2,
    cheap_model_fit: 4,
    likely_packages: ["apps/cli"],
  });
}

/** An event about task-1 in Acme. */
export function checkEvent(
  eventType: "issue.created" | "issue.updated" = "issue.updated",
): PluginEvent {
  return {
    eventId: `event-${Math.random()}`,
    eventType,
    occurredAt: now.toISOString(),
    actorType: "user",
    entityId: "task-1",
    entityType: "issue",
    companyId: "acme",
    payload: {},
  };
}

/** A request the check sent to Paperclip's API. */
export interface PaperclipRequest {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

/**
 * The check on a fake host. `answers` are Haiku's answers in order, as text
 * or an HTTP status; `blockedBy` are the ids the task is already blocked by;
 * `statusOnRead` is the status Paperclip reports when the clarify step reads the task.
 */
export function checkHarness(
  task: FakeCheckedTask,
  answers: (string | number)[],
  options: {
    settings?: Record<string, unknown>;
    model?: ThinSpecModel | undefined;
    blockedBy?: string[];
    statusOnRead?: string;
  } = {},
) {
  const { metrics, written } = fakeMetrics();
  const { state, saved } = fakeState();
  const logs: { level: string; line: string }[] = [];
  const asked: { headers: unknown; body: Record<string, unknown> }[] = [];
  const sent: PaperclipRequest[] = [];
  const ctx = {
    issues: { get: async (id: string) => (id === task.id ? structuredClone(task) : null) },
    agents: { list: async () => [{ id: "agent-pm", urlKey: "pm" }] },
    config: { get: async () => options.settings ?? checkSwitchOn },
    secrets: {
      resolve: async (ref: { secretId: string }) =>
        ref.secretId === "secret-tagger" ? anthropicKey : paperclipKey,
    },
    logger: {
      info: (line: string) => logs.push({ level: "info", line }),
      error: (line: string) => logs.push({ level: "error", line }),
    },
    metrics,
    state,
  } as unknown as ThinSpecApi;
  const anthropicFetch = async (_url: string | URL | Request, init?: RequestInit) => {
    asked.push({ headers: init?.headers, body: JSON.parse(String(init?.body)) });
    const next = answers.shift() ?? 500;
    if (typeof next === "number") {
      return new Response("{}", { status: next });
    }
    const usage = { input_tokens: 700, output_tokens: 120 };
    return Response.json({ content: [{ type: "text", text: next }], usage });
  };
  const paperclipFetch = async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace("http://paperclip.test:3100", "");
    const method = init?.method ?? "GET";
    sent.push({
      method,
      path,
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    if (method === "POST") {
      return Response.json({ id: "clarify-1" });
    }
    return Response.json({
      id: task.id,
      status: options.statusOnRead ?? task.status,
      blockedBy: (options.blockedBy ?? []).map((id) => ({ id })),
    });
  };
  const check = thinSpecCheck(ctx, {
    anthropicFetch: anthropicFetch as typeof fetch,
    paperclipFetch: paperclipFetch as typeof fetch,
    now: () => now,
    model: "model" in options ? options.model : testModel,
  });
  return { check, asked, sent, logs, written, saved };
}
