import { difficultyTagger, type TaggerApi } from "./difficulty-tagger.ts";
import { fakeMetrics, fakeState } from "./fake-host.test-helper.ts";
import { manifest } from "./manifest.ts";

/** A task as the fake host keeps it: only the fields the tagger reads. */
export interface FakeTaggerTask {
  id: string;
  identifier: string;
  companyId: string;
  status: string;
  title: string;
  description: string | null;
  labels: { id: string; name: string }[];
}

/** Made-up keys; the tests check neither shows up in a log line, a metric or the record. */
export const anthropicKey = "made-up-anthropic-key-91c2";
export const paperclipKey = "made-up-paperclip-key-7f3a";

/** The company's labels, as Paperclip's API lists them. */
export const companyLabels = [
  { id: "label-d1", name: "D1" },
  { id: "label-d2", name: "D2" },
  { id: "label-d3", name: "D3" },
  { id: "label-d4", name: "D4" },
  { id: "label-opus", name: "opus-only" },
  { id: "label-studio", name: "studio" },
];

/** Settings with both keys set and the switch on for the running version. */
export const taggerOn = {
  difficultyTaggerWritesForVersion: manifest.version,
  anthropicApiKey: { type: "secret_ref", secretId: "secret-anthropic" },
  paperclipApiUrl: "http://paperclip.test:3100",
  paperclipApiKey: { type: "secret_ref", secretId: "secret-paperclip" },
};

/** An open task with `labels`, by default a short code task. */
export function taggerTask(
  labels: string[] = [],
  changes: Partial<FakeTaggerTask> = {},
): FakeTaggerTask {
  return {
    id: "task-1",
    identifier: "HAL-1",
    companyId: "acme",
    status: "todo",
    title: "Fix the typo in the CLI help",
    description: "In apps/cli/src/help.ts, 'recieve' should read 'receive'.",
    labels: labels.map(
      (name) => companyLabels.find((label) => label.name === name) ?? { id: name, name },
    ),
    ...changes,
  };
}

/** A Messages API reply whose text is `answer`. */
export function modelReply(answer: string, stopReason = "end_turn"): unknown {
  return { content: [{ type: "text", text: answer }], stop_reason: stopReason };
}

/** What the model says about the typo task: code, D1, not opus-only. */
export const d1Answer =
  '{"kind": "code", "difficulty": "D1", "opus_only": false, "specified": true, "model": "haiku", "path": "direct"}';

/**
 * The tagger on a fake host whose task update applies the label ids, as
 * Paperclip does, so a test can replay the `issue.updated` it causes.
 */
export function taggerHarness(
  task: FakeTaggerTask,
  settings: Record<string, unknown> = taggerOn,
  reply: { status?: number; body?: unknown; onAsk?: () => void } = { body: modelReply(d1Answer) },
) {
  const { metrics, written } = fakeMetrics();
  const { state, saved } = fakeState();
  const logs: { level: string; line: string }[] = [];
  const asked: { url: string; headers: unknown; body: Record<string, unknown> }[] = [];
  const updates: unknown[] = [];
  const ctx = {
    issues: {
      get: async (id: string) => (id === task.id ? structuredClone(task) : null),
      update: async (_id: string, patch: { labelIds: string[] }) => {
        updates.push(patch);
        task.labels = patch.labelIds.map(
          (id) => companyLabels.find((label) => label.id === id) ?? { id, name: id },
        );
      },
    },
    http: {
      fetch: async (url: string, init?: RequestInit) => {
        asked.push({ url, headers: init?.headers, body: JSON.parse(String(init?.body)) });
        reply.onAsk?.();
        return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200 });
      },
    },
    config: { get: async () => settings },
    secrets: {
      resolve: async (ref: { secretId: string }) =>
        ref.secretId === "secret-anthropic" ? anthropicKey : paperclipKey,
    },
    logger: {
      info: (line: string) => logs.push({ level: "info", line }),
      warn: (line: string) => logs.push({ level: "warn", line }),
      error: (line: string) => logs.push({ level: "error", line }),
    },
    metrics,
    state,
  } as unknown as TaggerApi;
  const labelReads: { url: string; headers: unknown }[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    labelReads.push({ url, headers: init?.headers });
    return new Response(JSON.stringify(companyLabels), { status: 200 });
  };
  const tagger = difficultyTagger(ctx, { fetch });
  const labels = () => task.labels.map((label) => label.name);
  return { tagger, asked, updates, labelReads, logs, written, saved, labels };
}
