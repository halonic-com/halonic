import type { Secrets } from "@halonicjs/ports";
import { encodeBase64url } from "@halonicjs/std";
import { type KeyEncryptionKey, loadKeyEncryptionKey } from "./key-encryption-key.ts";

/** A `Secrets` store that gives `text` for every name, and remembers the names it was asked for. */
export function secretsWithKey(text: string | null): Secrets & { readonly asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    get: async (name) => {
      asked.push(name);
      return text;
    },
  };
}

/** A key-encryption key made from 32 bytes of `fill`, so two fills give two different keys. */
export async function kekFilledWith(fill: number): Promise<KeyEncryptionKey> {
  return await loadKeyEncryptionKey(secretsWithKey(encodeBase64url(new Uint8Array(32).fill(fill))));
}
