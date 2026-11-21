// The secrets a first-run test call may read: only the one key it tests, pasted
// or saved, under the provider's secret name, and never another.

import type { KeyProblem } from "@halonicjs/app";
import { type Secrets, secretKey } from "@halonicjs/ports";
import type { SecretText } from "@halonicjs/studio-kit";

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
