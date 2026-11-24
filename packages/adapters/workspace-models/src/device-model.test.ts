import {
  type ChatAgentSettings,
  type HttpClient,
  noKeyOrigins,
  type Secrets,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type DeviceModelContext, deviceModel } from "./index.ts";

const secrets: Secrets = { get: async () => "fake-key" };
const http: HttpClient = {
  fetch: async () => {
    throw new TypeError("fetch failed");
  },
};
const context: DeviceModelContext = { secrets, http, keyOrigins: noKeyOrigins, localOnly: false };

/** The person's own model, as Settings › Assistant gives it. */
const own: ChatAgentSettings = {
  type: "anthropic",
  model: "claude-sonnet-5-5",
  local: false,
  secret: "anthropic-key",
};

verifies("studio.assistant-authoring-turn", () => {
  describe("the Settings › Assistant model", () => {
    it("is the settings' provider, model and key, with no alias and no fallback", async () => {
      const model = await deviceModel(own, context);
      expect(model.provider.type).toBe("anthropic");
      expect(model.model).toBe("claude-sonnet-5-5");
      expect(model.secret).toBe("anthropic-key");
      expect(model.alias).toBeUndefined();
      expect(model.fallback ?? []).toEqual([]);
    });

    it("may be at the person's own address, which no workspace file sets", async () => {
      const proxy = { ...own, type: "openai-compatible", baseUrl: "https://llm.acme.test/v1" };
      await expect(deviceModel(proxy, context)).resolves.toMatchObject({ model: own.model });
    });

    it("keeps a key with a list of allowed origins to an origin on it", async () => {
      const proxy = { ...own, baseUrl: "https://llm.acme.test" };
      const keyOrigins = { allowedOrigins: async () => ["https://api.anthropic.com"] };
      await expect(deviceModel(proxy, { ...context, keyOrigins })).rejects.toMatchObject({
        code: "key-origin-not-allowed",
      });
    });

    it("refuses a secret name of Halonic's own or a plugin's", async () => {
      for (const secret of ["serve_password", "plugin__weather__acme-key"]) {
        await expect(deviceModel({ ...own, secret }, context)).rejects.toMatchObject({
          kind: "denied",
        });
      }
    });

    it("is refused away from this computer in a local-only workspace, whatever its local flag", async () => {
      await expect(
        deviceModel({ ...own, local: true }, { ...context, localOnly: true }),
      ).rejects.toMatchObject({ code: "not-on-this-machine" });
      const ollama = { type: "ollama", model: "qwen3", local: true };
      await expect(deviceModel(ollama, { ...context, localOnly: true })).resolves.toMatchObject({
        model: "qwen3",
      });
    });
  });
});
