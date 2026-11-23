import type { PluginEvent } from "@paperclipai/plugin-sdk";
import { fakeMetrics, fakeState } from "./fake-host.test-helper.ts";
import { manifest } from "./manifest.ts";
import { type TaskEffortApi, taskEffort } from "./task-effort.ts";

/** A task as the fake host keeps it: only the fields the handler reads. */
export interface FakeEffortTask {
  id: string;
  identifier: string;
  companyId: string;
  assigneeAgentId: string | null;
  labels: { name: string }[];
  assigneeAdapterOverrides: { adapterConfig?: Record<string, unknown> } | null;
}

/** A comment on a fake task. */
export interface FakeEffortComment {
  readonly authorAgentId: string | null;
  readonly createdAt: string;
  readonly body: string;
}

/** A made-up API key; the tests check it never shows up in a log line or a metric. */
export const apiKey = "made-up-paperclip-key-7f3a";

/** Settings with the switch on for the running version. */
export const switchOn = {
  taskEffortWritesForVersion: manifest.version,
  paperclipApiUrl: "http://paperclip.test:3100",
  paperclipApiKey: { type: "secret_ref", secretId: "secret-1" },
};

/** A task tagged `labels`, assigned to Mateo, with no effort. */
export function effortTask(
  labels: string[],
  changes: Partial<FakeEffortTask> = {},
): FakeEffortTask {
  return {
    id: "task-1",
    identifier: "HAL-1",
    companyId: "acme",
    assigneeAgentId: "agent-mateo",
    labels: labels.map((name) => ({ name })),
    assigneeAdapterOverrides: null,
    ...changes,
  };
}

/** An event about the task, by default caused by an agent. */
export function taskEvent(
  eventType: "issue.created" | "issue.updated",
  actorType: PluginEvent["actorType"] = "agent",
): PluginEvent {
  return {
    eventId: `event-${Math.random()}`,
    eventType,
    occurredAt: "2026-11-23T12:00:00Z",
    actorType,
    entityId: "task-1",
    entityType: "issue",
    companyId: "acme",
    payload: {},
  };
}

/**
 * The handler on a fake host whose API applies each PATCH to the task, as
 * Paperclip does, so a test can replay the `issue.updated` it causes.
 */
export function effortHarness(
  task: FakeEffortTask,
  settings: Record<string, unknown> = switchOn,
  comments: FakeEffortComment[] = [],
  answerStatus = 200,
) {
  const { metrics, written } = fakeMetrics();
  const { state, saved } = fakeState();
  const logs: { level: string; line: string }[] = [];
  const requests: { url: string; method: string; headers: unknown; body: unknown }[] = [];
  const ctx = {
    issues: {
      get: async (id: string) => (id === task.id ? structuredClone(task) : null),
      listComments: async () => comments,
    },
    agents: {
      list: async () => [
        { id: "agent-mateo", urlKey: "mateo" },
        { id: "agent-liam", urlKey: "liam" },
        { id: "agent-julian", urlKey: "julian" },
      ],
    },
    config: { get: async () => settings },
    secrets: { resolve: async () => apiKey },
    logger: {
      info: (line: string) => logs.push({ level: "info", line }),
      warn: (line: string) => logs.push({ level: "warn", line }),
      error: (line: string) => logs.push({ level: "error", line }),
    },
    metrics,
    state,
  } as unknown as TaskEffortApi;
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { assigneeAdapterOverrides: never };
    requests.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: init?.headers,
      body,
    });
    if (answerStatus === 200) {
      task.assigneeAdapterOverrides = body.assigneeAdapterOverrides;
    }
    return new Response("{}", { status: answerStatus });
  };
  const handler = taskEffort(ctx, { fetch: fetch as typeof globalThis.fetch });
  const effort = () => task.assigneeAdapterOverrides?.adapterConfig?.["effort"];
  return { handler, requests, logs, written, saved, effort };
}
