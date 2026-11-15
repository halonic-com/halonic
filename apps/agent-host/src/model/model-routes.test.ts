import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { chatBody, post, type Setup, startRoutes } from "./model-routes.test-helper.ts";

let setup: Setup | undefined;

afterEach(async () => {
  await setup?.close();
  setup = undefined;
});

async function started(env: Record<string, string> = {}): Promise<Setup> {
  setup = await startRoutes(env);
  await setup.provider("ollama", { type: "ollama", local: "true", baseUrl: setup.model.url });
  return setup;
}

verifies("agent-host.model-routes", () => {
  describe("the model route", () => {
    it("answers the ChatResponse of a provider on this machine", async () => {
      const { url, folders, model } = await started();
      const response = await post(url, chatBody(folders.workspace));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        content: "A short summary.",
        toolCalls: [],
        finishReason: "stop",
      });
      expect(model.asked).toHaveLength(1);
    });

    it("asks for the cap when the request names no maxTokens, and for its own number up to the cap", async () => {
      const { url, folders, model } = await started();
      await post(url, chatBody(folders.workspace));
      await post(url, chatBody(folders.workspace, "ollama", { params: { maxTokens: 300 } }));
      expect(model.asked).toMatchObject([{ max_tokens: 4096 }, { max_tokens: 300 }]);
    });

    it("reads the key from the host's own environment and sends it to the provider only", async () => {
      const { url, folders, model } = await started({
        HALONIC_SECRET_LOCAL_KEY: "fake-key-for-test",
      });
      await setup?.provider("keyed", {
        type: "openai-compatible",
        baseUrl: model.url,
        secret: "local-key",
      });
      const response = await post(url, chatBody(folders.workspace, "keyed"));
      expect(response.status).toBe(200);
      expect(model.authorizations).toEqual(["Bearer fake-key-for-test"]);
      expect(JSON.stringify(await response.json())).not.toContain("fake-key-for-test");
    });

    it("answers 404 for a provider the workspace doesn't have", async () => {
      const { url, folders } = await started();
      const response = await post(url, chatBody(folders.workspace, "nowhere"));
      expect(response.status).toBe(404);
    });

    it("answers 502 with the provider's own reason, and no key, when the call fails", async () => {
      const { url, folders, model } = await started();
      model.failWith = {
        status: 404,
        body: '{"error":{"message":"model \\"llama-test\\" not found"}}',
      };
      const response = await post(url, chatBody(folders.workspace));
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({ error: { kind: "model_failed" } });
    });

    it("never repeats the key in an answer, even when the provider's error body does", async () => {
      const { url, folders, model } = await started({
        HALONIC_SECRET_LOCAL_KEY: "fake-key-for-test",
      });
      await setup?.provider("keyed", {
        type: "openai-compatible",
        baseUrl: model.url,
        secret: "local-key",
      });
      model.failWith = { status: 401, body: '{"error":{"message":"bad key fake-key-for-test"}}' };
      const response = await post(url, chatBody(folders.workspace, "keyed"));
      expect(response.status).toBe(502);
      expect(JSON.stringify(await response.json())).not.toContain("fake-key-for-test");
      expect(setup?.logged.join("")).not.toContain("fake-key-for-test");
    });

    it("answers 400 for a type the host has no adapter for, though it runs here", async () => {
      const { url, folders } = await started();
      await setup?.provider("mine", { type: "anthropic", baseUrl: "http://127.0.0.1:9" });
      const response = await post(url, chatBody(folders.workspace, "mine"));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { kind: "provider_type_unsupported" } });
    });
  });
});
