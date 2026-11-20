// An Acme folder for the first run's model choice tests: files with unsaved
// changes and a save, a trust check built from the real trust content and
// fingerprint, a key store and a model whose answer each test picks.

import type { TrustCheck } from "@halonicjs/app";
import { type Connector, type Provider, parseFile } from "@halonicjs/format";
import type { ChatRequest, ChatResponse, Digest, Secrets } from "@halonicjs/ports";
import type { SecretText } from "@halonicjs/studio-kit";
import { reachesOnlyTheTestModel, trustContent, trustFingerprint } from "@halonicjs/workspace";
import { FirstRunModelChoice } from "./first-run-model-choice.ts";

export const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

export const acmeFiles: Readonly<Record<string, string>> = {
  "models.yaml":
    "aliases:\n  default:\n    description: The test model.\n    provider: mock\n    model: echo\n",
  "workspace.yaml":
    "# Acme is an invented company.\nid: acme\nname: Acme\nprivacy:\n  localOnly: true\n",
  "providers/mock.yaml": "id: mock\nname: Test model\ntype: mock\nlocal: true\n",
};

/** One call the model got: the provider file it was made from, the key its secrets gave, and the request. */
export interface ModelCall {
  readonly file: Provider;
  readonly key: string | null;
  readonly request: ChatRequest;
}

/** What the model does with a call; it answers "refund" unless a test says otherwise. */
export type Answer = (call: ModelCall) => Promise<ChatResponse>;

export function replyOf(content: string): ChatResponse {
  return {
    content,
    toolCalls: [],
    usage: { inputTokens: 40, outputTokens: 1 },
    finishReason: "stop",
  };
}

/** The provider or connector files on `disk`, parsed; one that doesn't parse fails the test. */
function parsedOnDisk<Kind extends "provider" | "connector">(
  disk: ReadonlyMap<string, string>,
  kind: Kind,
): (Kind extends "provider" ? Provider : Connector)[] {
  const folder = `${kind}s/`;
  return [...disk].flatMap(([path, text]) => {
    if (!path.startsWith(folder)) return [];
    const parsed = parseFile(kind, text, { id: path.slice(folder.length, -".yaml".length) });
    if (!parsed.ok) throw new Error(`${path} doesn't parse: ${JSON.stringify(parsed.error)}`);
    return [parsed.value.value as Kind extends "provider" ? Provider : Connector];
  });
}

/** The folder's trust as `WorkspaceTrust` gives it, from the real trust content of the files on `disk`. */
function trustOf(disk: ReadonlyMap<string, string>, steps: string[]) {
  const granted = new Set<string>();
  const state = {
    check: undefined as TrustCheck | undefined,
    needsNoTrust: false,
    fingerprint: undefined as string | undefined,
  };
  const trust = {
    get check() {
      return state.check;
    },
    get needsNoTrust() {
      return state.needsNoTrust;
    },
    async refresh() {
      const input = {
        connectors: parsedOnDisk(disk, "connector"),
        providers: parsedOnDisk(disk, "provider"),
      };
      const content = trustContent(input);
      const fingerprint = await trustFingerprint(content, digest);
      const status = granted.has(fingerprint) ? "trusted" : "new";
      state.fingerprint = fingerprint;
      state.check = { status, content, fingerprint, unpinned: [] } as TrustCheck;
      state.needsNoTrust = reachesOnlyTheTestModel(input);
    },
    async grant(shown: string) {
      steps.push("grant");
      if (shown !== state.fingerprint) return { ok: false as const, reason: "changed" };
      granted.add(shown);
      await trust.refresh();
      return { ok: true as const };
    },
    isTrusted: () => state.check?.status === "trusted",
  };
  /** Trusts the folder as it is on disk now, as a person would through the prompt. */
  const trustAsItIs = async () => {
    await trust.refresh();
    if (state.fingerprint !== undefined) granted.add(state.fingerprint);
    await trust.refresh();
  };
  return { trust, granted, trustAsItIs };
}

/** A model that records each call and answers as `answer` says. */
function modelOf(calls: ModelCall[], answer: () => Answer) {
  return (file: Provider, secrets: Secrets) => ({
    id: file.id,
    type: file.type,
    capabilities: { tools: true, jsonOutput: true, vision: false, streaming: false },
    chat: async (request: ChatRequest) => {
      const call = { file, key: await secrets.get(file.secret ?? ""), request };
      calls.push(call);
      return answer()(call);
    },
  });
}

/** An Acme folder and the choice service over it, with what each part saw. */
export function acmeFolder(options: { files?: Record<string, string> } = {}) {
  const disk = new Map(Object.entries(options.files ?? acmeFiles));
  const unsaved = new Map<string, string>();
  const stored = new Map<string, string>();
  const calls: ModelCall[] = [];
  const timers: { delayMs: number; fire: () => void }[] = [];
  const steps: string[] = [];
  const state = {
    answer: (async () => replyOf("refund")) as Answer,
    failSave: undefined as Error | undefined,
    failKey: undefined as Error | undefined,
  };
  const read = async (path: string) => unsaved.get(path) ?? disk.get(path) ?? null;
  const { trust, granted, trustAsItIs } = trustOf(disk, steps);
  const service = new FirstRunModelChoice({
    files: {
      readModels: () => read("models.yaml"),
      readWorkspace: () => read("workspace.yaml"),
      readProvider: read,
    },
    change: (label, changes) => {
      steps.push(`change: ${label}: ${Object.keys(changes).join(", ")}`);
      for (const [path, text] of Object.entries(changes)) unsaved.set(path, text);
    },
    settle: async () => {
      steps.push("settle");
      if (state.failSave !== undefined) throw state.failSave;
      for (const [path, text] of unsaved) disk.set(path, text);
      unsaved.clear();
    },
    keys: {
      save: async (name: string, key: SecretText) => {
        steps.push(`key: ${name}`);
        if (state.failKey !== undefined) throw state.failKey;
        stored.set(name, key.reveal());
      },
    },
    trust,
    digest,
    provider: modelOf(calls, () => state.answer),
    setTimer: (fire, delayMs) => {
      const timer = { delayMs, fire };
      timers.push(timer);
      return () => timers.splice(timers.indexOf(timer), 1);
    },
    newTestId: () => `test-${calls.length}`,
  });
  return { service, disk, stored, calls, timers, steps, state, trust, granted, trustAsItIs };
}

/** A model that answers only when the call is aborted, as one that never answers in time. */
export const neverAnswers: Answer = (call) =>
  new Promise((_, reject) => {
    call.request.signal?.addEventListener("abort", () =>
      reject(new DOMException("The operation was aborted.", "AbortError")),
    );
  });
