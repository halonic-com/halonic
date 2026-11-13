import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { workerSecrets } from "./worker-secrets.ts";

verifies("runtime.configuration", () => {
  it("reads a secret from its HALONIC_SECRET_ variable", async () => {
    const secrets = workerSecrets({ HALONIC_SECRET_TOKEN_KEY: "k" });
    expect(await secrets.get("token-key")).toBe("k");
  });

  it("reads no other variable, such as a provider's own key", async () => {
    const secrets = workerSecrets({ OPENAI_API_KEY: "k", TOKEN_KEY: "k" });
    expect(await secrets.get("openai-api-key")).toBeNull();
    expect(await secrets.get("token-key")).toBeNull();
  });

  it("does not take a binding for a secret, even one with the right name", async () => {
    const secrets = workerSecrets({ HALONIC_SECRET_X: { get: () => "k" } });
    expect(await secrets.get("x")).toBeNull();
  });
});
