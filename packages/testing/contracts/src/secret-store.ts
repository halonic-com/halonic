import { maxSecretValueLength, type SecretStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  invalidSecretNames,
  longestSecretName,
  lookalikeSecretNames,
  objectPropertySecretNames,
  unquotableSecretNames,
} from "./secret-names.ts";

/**
 * Makes the store under test, empty. `reopen` gives a store over what the
 * last one made saved, the way a restart does. A store that is only for tests
 * and keeps its map in the object hands back the same object.
 */
export interface SecretStoreHarness {
  make(): Promise<SecretStore>;
  reopen(): Promise<SecretStore>;
}

/** What `action` rejects with, or `undefined` when it succeeds. */
async function rejection(action: Promise<unknown>): Promise<unknown> {
  return await action.then(
    () => undefined,
    (reason: unknown) => reason,
  );
}

/** The contract every {@link SecretStore} adapter passes. */
export function secretStoreContract(name: string, harness: SecretStoreHarness): void {
  verifies("contracts.secret-store", () => {
    describe(`SecretStore contract: ${name}`, () => {
      it("sets, replaces, reads and removes a secret", async () => {
        const store = await harness.make();
        expect(await store.get("openai-key")).toBeNull();
        await store.set("openai-key", "one");
        expect(await store.get("openai-key")).toBe("one");
        await store.set("openai-key", "two");
        expect(await store.get("openai-key")).toBe("two");
        await store.remove("openai-key");
        expect(await store.get("openai-key")).toBeNull();
        await store.set(longestSecretName, "long");
        expect(await store.get(longestSecretName)).toBe("long");
      });

      it("removes a secret that isn't stored without a fuss, and touches no other", async () => {
        const store = await harness.make();
        await store.set("kept", "value");
        await store.remove("never-stored");
        expect(await store.get("kept")).toBe("value");
        expect(await store.names()).toEqual(["kept"]);
      });

      it("saves a value exactly as given, spaces, newlines and non-ASCII included", async () => {
        const store = await harness.make();
        const value = '  line one\nline "two" ü € \u{1F512}\t ';
        await store.set("odd-value", value);
        expect(await store.get("odd-value")).toBe(value);
        const longest = "x".repeat(maxSecretValueLength);
        await store.set("longest", longest);
        expect(await store.get("longest")).toBe(longest);
      });

      it("lists the names, sorted, as they were last written, and never a value", async () => {
        const store = await harness.make();
        await store.set("zeta-key", "z-value-1");
        await store.set("Alpha_Key", "a-value-2");
        await store.set("mid-key", "m-value-3");
        const names = await store.names();
        expect(names).toEqual(["Alpha_Key", "mid-key", "zeta-key"]);
        expect(JSON.stringify(names)).not.toMatch(/value/);
        await store.set("ALPHA-KEY", "a-value-4");
        expect(await store.names()).toEqual(["ALPHA-KEY", "mid-key", "zeta-key"]);
        expect(await store.names()).toHaveLength(3);
      });

      it("lists no names for an empty store", async () => {
        const store = await harness.make();
        expect(await store.names()).toEqual([]);
        await store.set("one", "x");
        await store.remove("one");
        expect(await store.names()).toEqual([]);
      });

      it("treats names that differ only in case or in - versus _ as the same secret", async () => {
        const store = await harness.make();
        await store.set("serve-password", "one");
        expect(await store.get("SERVE_PASSWORD")).toBe("one");
        await store.set("Serve_Password", "two");
        expect(await store.get("serve-password")).toBe("two");
        await store.remove("SERVE-PASSWORD");
        expect(await store.get("serve_password")).toBeNull();
        expect(await store.names()).toEqual([]);
      });

      it("refuses a name that breaks the rule with a RangeError, and changes nothing", async () => {
        const store = await harness.make();
        await store.set("serve-password", "kept");
        for (const bad of invalidSecretNames) {
          const label = JSON.stringify(bad);
          await expect(store.get(bad), label).rejects.toThrow(RangeError);
          await expect(store.set(bad, "x"), label).rejects.toThrow(RangeError);
          await expect(store.remove(bad), label).rejects.toThrow(RangeError);
        }
        expect(await store.get("serve-password")).toBe("kept");
        expect(await store.names()).toEqual(["serve-password"]);
      });

      it("refuses a name that only looks like a stored one, and leaves that secret alone", async () => {
        const store = await harness.make();
        await store.set("serve-password", "hash");
        await store.set("api-key", "key");
        for (const lookalike of lookalikeSecretNames) {
          const label = JSON.stringify(lookalike);
          await expect(store.get(lookalike), label).rejects.toThrow(RangeError);
          await expect(store.set(lookalike, "x"), label).rejects.toThrow(RangeError);
          await expect(store.remove(lookalike), label).rejects.toThrow(RangeError);
        }
        expect(await store.get("serve-password")).toBe("hash");
        expect(await store.get("api-key")).toBe("key");
      });

      it("keeps a name that is also a property of every object as its own secret", async () => {
        const store = await harness.make();
        for (const property of objectPropertySecretNames) {
          expect(await store.get(property), property).toBeNull();
        }
        await store.set("constructor", "one");
        expect(await store.get("constructor")).toBe("one");
        expect(await store.get("toString")).toBeNull();
        expect(await store.names()).toEqual(["constructor"]);
        await store.remove("constructor");
        expect(await store.get("constructor")).toBeNull();
      });

      it("refuses an empty value, or one over the limit, and keeps the old value", async () => {
        const store = await harness.make();
        await store.set("openai-key", "kept");
        await expect(store.set("openai-key", "")).rejects.toThrow(RangeError);
        await expect(store.set("openai-key", "x".repeat(maxSecretValueLength + 1))).rejects.toThrow(
          RangeError,
        );
        expect(await store.get("openai-key")).toBe("kept");
      });

      it("never repeats a value in an error", async () => {
        const store = await harness.make();
        const value = `${"v".repeat(maxSecretValueLength)}-leak-me`;
        for (const action of [store.set("openai-key", value), store.set("bad name", "leak-me")]) {
          const error = await rejection(action);
          expect(error).toBeInstanceOf(RangeError);
          expect((error as RangeError).message).not.toContain("leak-me");
        }
      });

      it("never repeats a long name, or one that isn't printable ASCII, in the error", async () => {
        const store = await harness.make();
        for (const { name: badName, part } of unquotableSecretNames) {
          for (const action of [
            store.get(badName),
            store.set(badName, "x"),
            store.remove(badName),
          ]) {
            const error = await rejection(action);
            expect((error as RangeError).message, JSON.stringify(badName)).not.toContain(part);
          }
        }
      });

      it("keeps every secret when several are set at once", async () => {
        const store = await harness.make();
        const names = Array.from({ length: 12 }, (_, index) => `secret-${index}`);
        await Promise.all(names.map((secret) => store.set(secret, `value-of-${secret}`)));
        for (const secret of names) {
          expect(await store.get(secret), secret).toBe(`value-of-${secret}`);
        }
        expect(await store.names()).toHaveLength(names.length);
      });

      it("keeps its secrets over a restart", async () => {
        const store = await harness.make();
        await store.set("openai-key", "sk-kept");
        await store.set("gone", "x");
        await store.remove("gone");
        const again = await harness.reopen();
        expect(await again.get("openai-key")).toBe("sk-kept");
        expect(await again.get("gone")).toBeNull();
        expect(await again.names()).toEqual(["openai-key"]);
      });
    });
  });
}
