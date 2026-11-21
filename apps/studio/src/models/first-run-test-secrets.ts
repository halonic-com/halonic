// The secrets a first-run test call may read: only the one key it tests, pasted
// or saved, under the provider's secret name, and never another.

import type { KeyProblem } from "@halonicjs/app";
import { type Secrets, secretKey, workspaceSecrets } from "@halonicjs/ports";
import type { SecretText } from "@halonicjs/studio-kit";

/**
 * The keys saved on this computer as the first run asks for them: whether one is there, and the
 * key itself for its test, both by the one name a run reads it by.
 */
export interface SavedKeys extends Secrets {
  /** Whether a key is saved under `name`, without reading it. */
  stored(name: string): Promise<boolean>;
}

/**
 * The keychain's keys under the workspace's name rule (`workspaceSecrets`), for both questions, so
 * the screen never says "A key is saved" for a name the test then reads nothing under.
 */
export function workspaceSavedKeys(
  keychain: Secrets & { has(name: string): Promise<boolean> },
): SavedKeys {
  // `has` answers in place of `get`, so `stored` takes the very path `get` takes and reads no key.
  const presence = workspaceSecrets({
    get: async (name) => ((await keychain.has(name)) ? "" : null),
  });
  return {
    get: workspaceSecrets(keychain).get,
    stored: async (name) => (await presence.get(name)) !== null,
  };
}

/** Secrets holding only the pasted key, under the provider's secret name. */
export function onlySecret(name: string | undefined, key: SecretText | undefined): Secrets {
  return {
    get: async (asked) =>
      name !== undefined && key !== undefined && secretKey(asked) === secretKey(name)
        ? key.reveal()
        : null,
  };
}

/** Secrets holding only the saved key under the provider's secret name, as the test may read no other. */
export function onlySaved(name: string, saved: Secrets): Secrets {
  return { get: async (asked) => (secretKey(asked) === secretKey(name) ? saved.get(asked) : null) };
}

/** What `keyProblem` says for nothing pasted, should it ever take an empty text as a key. */
export const emptyKey: KeyProblem = { kind: "empty", keyStart: "" };
