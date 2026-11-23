import type { PluginEvent } from "@paperclipai/plugin-sdk";
import { fakeMetrics, fakeState } from "./fake-host.test-helper.ts";
import { manifest } from "./manifest.ts";
import { type TaskTaggerApi, taskTagger } from "./task-tagger.ts";

/** Made-up keys; the tests check neither shows up in a log line, a metric or a task. */
export const anthropicKey = "made-up-anthropic-key-91c2";
export const paperclipKey = "made-up-paperclip-key-4d8e";

/** Settings with the tagger on for the running version. */
export const taggerOn = {
  taskTaggerWritesForVersion: manifest.version,
  taggerAnthropicKey: { type: "secret_ref", secretId: "secret-anthropic" },
  paperclipApiUrl: "http://paperclip.test:3100",
  paperclipApiKey: { type: "secret_ref", secretId: "secret-paperclip" },
};

/** The company's labels, as Paperclip's API lists them. */
const companyLabelList = ["D1", "D2", "D3", "D4", "opus-only", "docs"].map((name) => ({
  id: `label-${name}`,
  name,
}));

/** A task as the fake host keeps it. */
export interface FakeTaggedTask {
  id: string;
  identifier: string;
  companyId: string;
  title: string;
  description: string | null;
  labels: { id: string; name: string }[];
}

/** A new task titled "Fix the footer link", with the given labels. */
export function taggedTask(labels: string[] = []): FakeTaggedTask {
  return {
    id: "task-1",
    identifier: "HAL-1",
    companyId: "acme",
    title: "Fix the footer link",
    description: "The footer links to the old docs. Point it at the new docs in apps/site.",
    labels: labels.map((name) => ({ id: `label-${name}`, name })),
  };
}

/** An event about the task. */
export function tagEvent(eventType: "issue.created" | "issue.updated"): PluginEvent {
  return {
    eventId: `event-${Math.random()}`,
    eventType,
    occurredAt: "2026-11-23T12:00:00Z",
    actorType: "user",
    entityId: "task-1",
    entityType: "issue",
    companyId: "acme",
    payload: {},
  };
}

/** Haiku's answer as the Messages API wraps it, with the token counts it reports. */
export function haikuSays(text: string, usage = { input_tokens: 2000, output_tokens: 100 }) {
  return { status: 200, body: { content: [{ type: "text", text }], usage } };
}

/** A code verdict in the prompt's JSON. */
export function codeVerdict(difficulty: string, opusOnly = false, kind = "code"): string {
  return JSON.stringify({
    kind,
    difficulty,
    opus_only: opusOnly,
    specified: true,
    model: "sonnet",
    path: "standard",
  });
}

/** The tagger on a fake host whose `issues.update` applies the labels, as Paperclip does. */
export function taggerHarness(
  task: FakeTaggedTask,
  settings: Record<string, unknown> = taggerOn,
  options: { now?: Date } = {},
) {
  const { metrics, written } = fakeMetrics();
  const { state, saved } = fakeState();
  const logs: { level: string; line: string }[] = [];
  const requests: { url: string; headers: unknown; body: unknown }[] = [];
  const resolved: string[] = [];
  const answers: { status: number; body: unknown }[] = [];
  const ctx = {
    issues: {
      get: async (id: string) => (id === task.id ? structuredClone(task) : null),
      update: async (_id: string, patch: { labelIds: string[] }) => {
        task.labels = patch.labelIds.map((id) => ({ id, name: id.replace(/^label-/, "") }));
      },
    },
    companies: { list: async () => [{ id: "acme", name: "Acme" }] },
    config: { get: async () => settings },
    secrets: {
      resolve: async (ref: { secretId: string }) => {
        resolved.push(ref.secretId);
        return ref.secretId === "secret-anthropic" ? anthropicKey : paperclipKey;
      },
    },
    logger: {
      info: (line: string) => logs.push({ level: "info", line }),
      warn: (line: string) => logs.push({ level: "warn", line }),
      error: (line: string) => logs.push({ level: "error", line }),
    },
    metrics,
    state,
  } as unknown as TaskTaggerApi;
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    requests.push({ url: String(url), headers: init?.headers, body });
    if (String(url).endsWith("/labels")) {
      return Response.json(companyLabelList);
    }
    const answer = answers.shift() ?? { status: 500, body: {} };
    return Response.json(answer.body, { status: answer.status });
  };
  // A test moves the clock by setting `clock.now`.
  const clock = { now: options.now ?? new Date("2026-11-23T12:00:00Z") };
  const tagger = taskTagger(ctx, { fetch: fetch as typeof globalThis.fetch, now: () => clock.now });
  const labels = () => task.labels.map((label) => label.name);
  const haikuCalls = () => requests.filter((request) => request.url.includes("anthropic"));
  return { tagger, clock, answers, requests, haikuCalls, resolved, logs, written, saved, labels };
}
