import type { PluginEvent } from "@paperclipai/plugin-sdk";
import { difficultyTagger } from "./difficulty-tagger.ts";
import type { TaggerApi } from "./difficulty-tagger-calls.ts";
import { fakeMetrics, fakeState } from "./fake-host.test-helper.ts";
import { manifest } from "./manifest.ts";

/** A task as the fake host keeps it: only the fields the tagger reads. */
export interface FakeTaggedTask {
  id: string;
  identifier: string;
  companyId: string;
  title: string;
  description: string | null;
  labels: { id: string; name: string }[];
}

/** Made-up keys; the tests check they never show up in a log line or a metric. */
export const anthropicKey = "made-up-anthropic-key-91c2";
const paperclipKey = "made-up-paperclip-key-7f3a";

/** The company's labels, as Paperclip's API lists them. */
export const companyLabels = ["D1", "D2", "D3", "D4", "opus-only", "studio"].map((name) => ({
  id: `label-${name}`,
  name,
}));

/** Settings with the tagger on for the running version. */
export const taggerSwitchOn = {
  difficultyTaggerForVersion: manifest.version,
  taggerAnthropicKey: { type: "secret_ref", secretId: "secret-tagger" },
  paperclipApiUrl: "http://paperclip.test:3100",
  paperclipApiKey: { type: "secret_ref", secretId: "secret-paperclip" },
};

/** A task with these labels and a short spec. */
export function taggedTask(
  labels: string[],
  changes: Partial<FakeTaggedTask> = {},
): FakeTaggedTask {
  return {
    id: "task-1",
    identifier: "HAL-1",
    companyId: "acme",
    title: "Fix the typo in the CLI help",
    description: "apps/cli/src/help.ts says 'wrokspace'.",
    labels: labels.map((name) => ({ id: `label-${name}`, name })),
    ...changes,
  };
}

/** An event about a task in Acme, task-1 by default. */
export function tagEvent(
  eventType: "issue.created" | "issue.updated" = "issue.updated",
  taskId = "task-1",
): PluginEvent {
  return {
    eventId: `event-${Math.random()}`,
    eventType,
    occurredAt: "2026-11-23T12:00:00Z",
    actorType: "user",
    entityId: taskId,
    entityType: "issue",
    companyId: "acme",
    payload: {},
  };
}

/**
 * What Haiku answers next: a JSON answer as text, or an HTTP status.
 * `meanwhile` runs while Haiku answers, as a person changing the task would.
 */
export type HaikuAnswer =
  | { text: string; inputTokens?: number; outputTokens?: number; meanwhile?: () => void }
  | { status: number };

/** A JSON answer the way the prompt asks for it. */
export function answer(kind: string, difficulty: string, opusOnly: boolean): HaikuAnswer {
  return {
    text: JSON.stringify({
      kind,
      difficulty,
      opus_only: opusOnly,
      specified: true,
      model: "sonnet",
      path: "standard",
    }),
  };
}

/**
 * The tagger on a fake host whose label writes change the task, as Paperclip
 * does, so a test can replay the `issue.updated` they cause. `answers` are
 * Haiku's answers in order.
 */
export function taggerHarness(
  task: FakeTaggedTask,
  answers: HaikuAnswer[],
  settings: Record<string, unknown> = taggerSwitchOn,
  now = new Date("2026-11-23T12:00:00Z"),
) {
  const { metrics, written } = fakeMetrics();
  const { state, saved } = fakeState();
  const logs: { level: string; line: string }[] = [];
  const asked: { url: string; headers: unknown; body: Record<string, unknown> }[] = [];
  const clock = { now };
  const tasks = [task];
  const ctx = {
    issues: {
      get: async (id: string) => structuredClone(tasks.find((known) => known.id === id) ?? null),
      update: async (id: string, patch: { labelIds: string[] }) => {
        const changed = tasks.find((known) => known.id === id) as FakeTaggedTask;
        changed.labels = patch.labelIds.map(
          (labelId) =>
            companyLabels.find((label) => label.id === labelId) ?? { id: labelId, name: labelId },
        );
        return changed;
      },
    },
    config: { get: async () => settings },
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
  } as unknown as TaggerApi;
  const anthropicFetch = async (url: string | URL | Request, init?: RequestInit) => {
    asked.push({ url: String(url), headers: init?.headers, body: JSON.parse(String(init?.body)) });
    const next = answers.shift() ?? { status: 500 };
    if ("status" in next) {
      return new Response("{}", { status: next.status });
    }
    next.meanwhile?.();
    const usage = { input_tokens: next.inputTokens ?? 900, output_tokens: next.outputTokens ?? 40 };
    return Response.json({ content: [{ type: "text", text: next.text }], usage });
  };
  // The labels Paperclip's API lists; a test may take one away.
  const listedLabels = [...companyLabels];
  const paperclipFetch = async () => Response.json(listedLabels);
  const tagger = difficultyTagger(ctx, {
    anthropicFetch: anthropicFetch as typeof fetch,
    paperclipFetch: paperclipFetch as typeof fetch,
    now: () => clock.now,
  });
  const labels = () => task.labels.map((label) => label.name);
  /** Adds another task to the fake host. */
  const addTask = (another: FakeTaggedTask) => tasks.push(another);
  return { tagger, asked, logs, written, saved, labels, clock, addTask, listedLabels };
}
