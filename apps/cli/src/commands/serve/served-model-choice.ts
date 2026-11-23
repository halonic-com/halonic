// The model choice behind a served window's Pick a model (HAL-14808 PR 3): the server's
// `ModelChoicePort` on this computer's parts. The key goes to this computer's secrets file, the
// one a run reads; Ollama is asked through the client a run's calls go through; the choice files
// are written and committed (see `choice-files.ts`). Trust stays a step at this computer (D2):
// the service here can read whether the workspace is trusted, never grant it.

import { readOllamaTags } from "@halonicjs/adapter-http-kit";
import { workspaceProvider } from "@halonicjs/adapter-workspace-models";
import {
  detectLocalModels,
  FirstRunModelChoice,
  type ModelChoiceTrust,
  ollamaDownloadedModelSource,
  workspaceSavedKeys,
} from "@halonicjs/app";
import type { ModelChoicePort, TrustGate } from "@halonicjs/host-server";
import type { Digest, HttpClient, SecretStore, Secrets } from "@halonicjs/ports";
import { plainText } from "../../messages/phrase.ts";
import { serveMessages } from "../../messages/serve.ts";
import { type ChoiceFilesInput, saveChoiceFiles } from "./choice-files.ts";

/** What the served model choice uses on this computer. */
export interface ServedModelChoiceInput {
  /** The workspace's files and history, where Continue saves the choice. */
  readonly files: ChoiceFilesInput;
  /** Where Continue saves a tested key: this computer's secrets file. */
  readonly keys: Pick<SecretStore, "set" | "remove">;
  /** The secrets a run reads, for "A key is saved" and a test with the saved key. */
  readonly secrets: Secrets;
  /** The served workspace's trust check, the one served runs ask before they start. */
  readonly trust: TrustGate;
  /** The client a run's model calls go through; the test and Ollama's list use it. */
  readonly http: HttpClient;
  readonly digest: Digest;
}

/**
 * How many sessions keep a service. The one used longest ago is forgotten first, so the server
 * never holds more; that session's test then has to run again, as the port allows.
 */
export const maxChoiceSessions = 20;

/** The served model choice: one service per signed-in session, saving one choice at a time. */
export function servedModelChoice(input: ServedModelChoiceInput): ModelChoicePort {
  const services = new Map<string, FirstRunModelChoice>();
  let saving: Promise<unknown> = Promise.resolve();
  // Two sessions pressing Continue at once save one after the other, each from its own files.
  const save = (changes: Readonly<Record<string, string>>): Promise<void> => {
    const saved = saving.then(() => saveChoiceFiles(input.files, changes));
    saving = saved.catch(() => undefined);
    return saved;
  };
  return {
    forSession(session) {
      const known = services.get(session);
      services.delete(session);
      const service = known ?? sessionService(input, save);
      services.set(session, service);
      for (const oldest of services.keys()) {
        if (services.size <= maxChoiceSessions) break;
        services.delete(oldest);
      }
      return service;
    },
  };
}

function sessionService(
  input: ServedModelChoiceInput,
  save: (changes: Readonly<Record<string, string>>) => Promise<void>,
): FirstRunModelChoice {
  const { store } = input.files;
  // This session's waiting change: written only when its Continue saves it.
  let waiting: Readonly<Record<string, string>> | undefined;
  return new FirstRunModelChoice({
    files: {
      readModels: () => store.read("models.yaml"),
      readWorkspace: () => store.read("workspace.yaml"),
      readProvider: (path) => store.read(path),
    },
    change: (_label, changes) => {
      waiting = changes;
      return () => {
        if (waiting === changes) waiting = undefined;
      };
    },
    settle: async () => {
      const changes = waiting;
      waiting = undefined;
      if (changes !== undefined) await save(changes);
    },
    keys: {
      save: (name, key) => input.keys.set(name, key.reveal()),
      remove: (name) => input.keys.remove(name),
    },
    // A saved key is read only for its own test, under the name rule a run reads keys by.
    saved: workspaceSavedKeys({
      get: (name) => input.secrets.get(name),
      has: async (name) => (await input.secrets.get(name)) !== null,
    }),
    trust: readOnlyTrust(input.trust),
    digest: input.digest,
    // The test call goes the way a run's calls go, with only the one key it tests as its secrets.
    provider: (file, secrets) => workspaceProvider(file, { secrets, http: input.http }),
    timeLimit: (delayMs) => {
      const limit = new AbortController();
      const timer = setTimeout(() => limit.abort(), delayMs);
      return { signal: limit.signal, stop: () => clearTimeout(timer) };
    },
    newTestId: () => crypto.randomUUID(),
    localModels: () =>
      detectLocalModels(ollamaDownloadedModelSource(() => readOllamaTags(input.http))),
  });
}

/**
 * The workspace's trust as the served gate answers it. It has no check to work a fingerprint
 * from, so the trust line never offers one, and `grant` always refuses: only a person at this
 * computer trusts a workspace, with `halonic trust` (D2).
 */
export function readOnlyTrust(gate: TrustGate): ModelChoiceTrust {
  let trusted = false;
  return {
    check: undefined,
    needsNoTrust: false,
    async refresh() {
      trusted = (await gate.check()).state === "trusted";
    },
    grant: async () => ({ ok: false, reason: plainText(serveMessages.choiceNoTrust().phrase) }),
    isTrusted: () => trusted,
  };
}
