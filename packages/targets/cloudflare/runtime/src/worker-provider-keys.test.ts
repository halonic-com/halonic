import { ProviderKeysReadOnlyError } from "@halonicjs/host-server";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { workerProviderKeys } from "./worker-provider-keys.ts";
import { workerSecrets } from "./worker-secrets.ts";

const canaryKey = "sk-canary-provider-key-1234";

verifies("runtime.serve", () => {
  const keys = workerProviderKeys(workerSecrets({ HALONIC_SECRET_OPENAI_KEY: canaryKey }));

  it("says whether a Workers secret is set", async () => {
    expect(await keys.has("openai-key")).toBe(true);
    expect(await keys.has("other-key")).toBe(false);
  });

  it("refuses to save or remove a key, and the error holds neither name nor value", async () => {
    for (const attempt of [
      () => keys.set("openai-key", "sk-new-value"),
      () => keys.remove("openai-key"),
    ]) {
      const error = await attempt().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ProviderKeysReadOnlyError);
      const message = (error as Error).message;
      expect(message).not.toContain("openai");
      expect(message).not.toContain(canaryKey);
    }
  });

  it("leaves the secret as it was", async () => {
    await keys.set("openai-key", "sk-new-value").catch(() => undefined);
    expect(await keys.has("openai-key")).toBe(true);
  });
});
