// A fake model choice service for the Pick a model tests: each test call waits
// until the test answers it, so a test can let an older call end after a newer one.

import type { FirstRunKeyProvider, LocalModels, ModelChoice } from "@halonicjs/app";
import type { SecretText } from "@halonicjs/studio-kit";
import type {
  ModelChoiceLine,
  ModelChoicePreview,
  ModelChoiceSaved,
  ModelChoiceService,
  ModelChoiceTest,
} from "../api.ts";
import { type PickDone, PickModel } from "./pick-model.ts";

/** One test call the fake got, and the way to answer it. */
export interface PendingTest {
  readonly choice: ModelChoice;
  /** What the screen passed: `undefined` for the saved key. */
  readonly key: string | undefined;
  readonly answer: (test: ModelChoiceTest) => void;
}

export const anthropicLine: ModelChoiceLine = {
  reaches: { name: "Anthropic", secrets: 1, host: undefined, local: false },
  localOnlyOff: true,
};

export const ollamaLine: ModelChoiceLine = {
  reaches: { name: "Ollama", secrets: 0, host: "localhost:11434", local: true },
  localOnlyOff: false,
};

/** A Pick a model screen over a fake service, with what the service and the screen saw. */
export function pickRig(
  options: { saved?: FirstRunKeyProvider[]; local?: LocalModels; noService?: boolean } = {},
) {
  const tests: PendingTest[] = [];
  const continued: { testId: string; fingerprint: string | undefined }[] = [];
  const done: PickDone[] = [];
  const timers: { delayMs: number; fire: () => void; stopped: boolean }[] = [];
  const state = {
    local: options.local ?? ({ kind: "not-found", cause: new Error("off") } as LocalModels),
    preview: undefined as ModelChoicePreview | undefined,
    saved: { ok: true, changes: [], trusted: true } as ModelChoiceSaved,
  };
  const lineOf = (choice: ModelChoice) => (choice.kind === "key" ? anthropicLine : ollamaLine);
  const service: ModelChoiceService = {
    test: (choice: ModelChoice, key?: SecretText) =>
      new Promise((answer) => tests.push({ choice, key: key?.reveal(), answer })),
    keySaved: async (provider) => options.saved?.includes(provider) ?? false,
    localModels: async () => state.local,
    lineFacts: async (choice) => lineOf(choice),
    preview: async () => state.preview ?? { ...anthropicLine, fingerprint: "fp-1" },
    continue: async (testId, fingerprint) => {
      continued.push({ testId, fingerprint });
      return state.saved;
    },
  };
  const model = new PickModel({
    service: options.noService === true ? undefined : service,
    setTimer: (fire, delayMs) => {
      const timer = { delayMs, fire, stopped: false };
      timers.push(timer);
      return () => {
        timer.stopped = true;
      };
    },
    onDone: (end) => done.push(end),
  });
  return { model, tests, continued, done, timers, state };
}

/** Lets the promises that are already settled run their callbacks. */
export async function settled(): Promise<void> {
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
}
