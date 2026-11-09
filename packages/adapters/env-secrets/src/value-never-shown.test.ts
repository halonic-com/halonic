import { MemorySecrets } from "@halonicjs/adapter-memory";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { EnvSecrets } from "./env-secrets.ts";
import { firstSecret } from "./first-secret.ts";

const value = "made-up-secret-value";

afterEach(() => {
  vi.restoreAllMocks();
});

verifies("env-secrets.value-never-shown", () => {
  it("names the secret in a RangeError, never a value", async () => {
    const env = new EnvSecrets({
      HALONIC_SECRET_SERVE_PASSWORD: value,
      "HALONIC_SECRET_SERVE PASSWORD": value,
    });
    const chain = firstSecret(env, new MemorySecrets({ "serve-password": value }));
    for (const secrets of [env, chain]) {
      const error = await secrets.get("serve password").catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(RangeError);
      expect(String(error)).toContain('"serve password"');
      expect(String(error)).not.toContain(value);
    }
  });

  it("writes nothing to the console while it reads", async () => {
    const methods = ["log", "info", "warn", "error", "debug", "trace"] as const;
    const spies = methods.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    const chain = firstSecret(
      new EnvSecrets({ HALONIC_SECRET_OPENAI: value }),
      new MemorySecrets({ anthropic: value }),
    );
    await chain.get("openai");
    await chain.get("anthropic");
    await chain.get("missing");
    await chain.get("bad name").catch(() => undefined);
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
