import { writeDefinitionSnapshot } from "@halonicjs/adapter-cloudflare-storage";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ConfigurationError, type RuntimeEnv } from "./env.ts";
import { createRuntime, scopedKeyPrefix } from "./runtime.ts";

const namespace = { idFromName: (name: string) => name, get: () => ({}) };
const secrets = {
  HALONIC_SECRET_TOKEN_KEY: "a-secret-value",
  HALONIC_SECRET_SERVE_PASSWORD: "another-secret-value",
};
const notePath = "hubs/acme/notes.md";

/** An R2 bucket in memory: enough for the snapshot writer and the definition source. */
function memoryBucket() {
  const objects = new Map<string, Uint8Array>();
  return {
    async put(key: string, value: string | Uint8Array) {
      objects.set(key, typeof value === "string" ? new TextEncoder().encode(value) : value);
    },
    async get(key: string) {
      const bytes = objects.get(key);
      if (bytes === undefined) return null;
      return { arrayBuffer: async () => bytes.slice().buffer };
    },
  };
}

/** A bucket holding snapshot A, then snapshot B, so `current` names B. */
async function bucketWithTwoSnapshots(keyPrefix?: string) {
  const bucket = memoryBucket();
  const first = await writeDefinitionSnapshot(bucket, { [notePath]: "A" }, [], keyPrefix);
  const second = await writeDefinitionSnapshot(bucket, { [notePath]: "B" }, [], keyPrefix);
  return { bucket, first, second };
}

function envWith(definitions: unknown, variables: Record<string, unknown> = {}): RuntimeEnv {
  return {
    COORDINATION: namespace,
    RUN: namespace,
    ROUTINES: namespace,
    DB: {},
    BLOBS: {},
    DEFINITIONS: definitions,
    ...secrets,
    ...variables,
  } as unknown as RuntimeEnv;
}

verifies("runtime.definitions-version", () => {
  describe("the pinned definitions snapshot", () => {
    it("serves the pinned snapshot, not the newer one current names", async () => {
      const { bucket, first } = await bucketWithTwoSnapshots();
      const runtime = await createRuntime(envWith(bucket, { HALONIC_DEFINITIONS_VERSION: first }));
      expect(await runtime.definitions.read(notePath)).toBe("A");
      expect(await runtime.definitions.version()).toBe(first);
    });

    it("falls back to current only when the variable is missing", async () => {
      const { bucket, second } = await bucketWithTwoSnapshots();
      const runtime = await createRuntime(envWith(bucket));
      expect(await runtime.definitions.read(notePath)).toBe("B");
      expect(await runtime.definitions.version()).toBe(second);
    });

    it("pins the version under a scope's key prefix", async () => {
      const scope = "scope-1";
      const { bucket, first } = await bucketWithTwoSnapshots(scopedKeyPrefix(scope));
      const runtime = await createRuntime(envWith(bucket, { HALONIC_DEFINITIONS_VERSION: first }), {
        scope,
      });
      expect(await runtime.definitions.read(notePath)).toBe("A");
    });

    it.each(["", "  ", "latest", 42])(
      "refuses %j rather than fall back to current",
      async (value) => {
        const { bucket } = await bucketWithTwoSnapshots();
        const error = await createRuntime(
          envWith(bucket, { HALONIC_DEFINITIONS_VERSION: value }),
        ).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(ConfigurationError);
        expect((error as ConfigurationError).missing).toEqual(["HALONIC_DEFINITIONS_VERSION"]);
      },
    );
  });
});
