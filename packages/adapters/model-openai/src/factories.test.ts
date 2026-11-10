import {
  isModelCallError,
  type LlmProviderFactory,
  type ProviderConfig,
  type Secrets,
} from "@halonicjs/ports";
import { chatRequest, textAnswer } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  lmStudioFactory,
  ollamaFactory,
  openAiCompatibleFactory,
  openAiFactories,
  openAiFactory,
} from "./factories.ts";
import { ScriptedVendor } from "./test/scripted-vendor.ts";

/** A secrets store that holds `values` and nothing else. */
function secretsWith(values: Record<string, string> = {}): Secrets {
  return { get: async (name) => values[name] ?? null };
}

/** The config a workspace's YAML would give, with the schema's defaults. */
function config(fields: Partial<ProviderConfig> & { type: string }): ProviderConfig {
  return { id: "acme", local: false, options: {}, ...fields };
}

/** Makes the provider for `fields` in front of a fresh scripted vendor that answers once. */
function created(
  factory: LlmProviderFactory,
  fields: Partial<ProviderConfig> & { type: string },
  secrets: Secrets = secretsWith(),
) {
  const vendor = new ScriptedVendor();
  vendor.answerNext(textAnswer);
  const provider = factory.create(config(fields), { secrets, http: vendor });
  return { vendor, provider };
}

/** The first call `factory` sends for `fields`. */
async function firstCall(
  factory: LlmProviderFactory,
  fields: Partial<ProviderConfig> & { type: string },
  secrets?: Secrets,
) {
  const { vendor, provider } = created(factory, fields, secrets);
  await provider.chat(chatRequest());
  const call = vendor.received[0];
  if (call === undefined) throw new Error("the vendor received no call");
  return call;
}

verifies("model-openai.factories", () => {
  it("has one factory per type", () => {
    expect(openAiFactories.map((factory) => factory.type)).toEqual([
      "openai",
      "openai-compatible",
      "ollama",
      "lmstudio",
    ]);
  });

  describe("fills in the type's address unless the YAML gives one", () => {
    it.each([
      [openAiFactory, "https://api.openai.com/v1/chat/completions"],
      [ollamaFactory, "http://localhost:11434/v1/chat/completions"],
      [lmStudioFactory, "http://localhost:1234/v1/chat/completions"],
    ])("%#", async (factory, url) => {
      const secrets = secretsWith({ "openai-key": "test-key-1" });
      const call = await firstCall(factory, { type: factory.type, secret: "openai-key" }, secrets);
      expect(call.url).toBe(url);
    });

    it("uses the YAML's baseUrl", async () => {
      const call = await firstCall(lmStudioFactory, {
        type: "lmstudio",
        baseUrl: "http://box.test:1234/v1",
      });
      expect(call.url).toBe("http://box.test:1234/v1/chat/completions");
    });
  });

  it("refuses an openai-compatible provider without a baseUrl, naming it", () => {
    expect(() =>
      openAiCompatibleFactory.create(config({ type: "openai-compatible" }), {
        secrets: secretsWith(),
        http: new ScriptedVendor(),
      }),
    ).toThrow('Provider "acme"');
  });

  it("refuses a secret that isn't a valid secret name, without repeating it", () => {
    const create = () =>
      ollamaFactory.create(config({ type: "ollama", secret: "not a name" }), {
        secrets: secretsWith(),
        http: new ScriptedVendor(),
      });
    expect(create).toThrow('Provider "acme": secret must be');
    expect(create).not.toThrow("not a name");
  });

  it("sends the key from the secret only in the Authorization header", async () => {
    const secrets = secretsWith({ "openai-key": "test-key-1" });
    const call = await firstCall(openAiFactory, { type: "openai", secret: "openai-key" }, secrets);
    expect(call.headers["authorization"]).toBe("Bearer test-key-1");
    expect(JSON.stringify(call.body)).not.toContain("test-key-1");
  });

  it("reads the key on every call, so a secret set later is used", async () => {
    const values: Record<string, string> = {};
    const { vendor, provider } = created(
      ollamaFactory,
      { type: "ollama", secret: "ollama-key" },
      secretsWith(values),
    );
    await expect(provider.chat(chatRequest())).rejects.toSatisfy(isModelCallError);
    values["ollama-key"] = "test-key-2";
    await provider.chat(chatRequest());
    expect(vendor.received[0]?.headers["authorization"]).toBe("Bearer test-key-2");
  });

  describe("fails with no-key before sending anything", () => {
    it.each([
      ["a secret that isn't set", { type: "openai", secret: "openai-key" }],
      ["an openai provider without a secret", { type: "openai" }],
    ])("%s", async (_, fields) => {
      const { vendor, provider } = created(openAiFactory, fields);
      const error: unknown = await provider.chat(chatRequest()).catch((thrown: unknown) => thrown);
      expect(isModelCallError(error) && error.reason).toBe("no-key");
      expect(vendor.calls().started).toBe(0);
    });
  });

  it("names the missing secret in the no-key message", async () => {
    const { provider } = created(openAiFactory, { type: "openai", secret: "openai-key" });
    await expect(provider.chat(chatRequest())).rejects.toThrow(
      'acme has no API key: the secret "openai-key" isn\'t set',
    );
  });

  it("asks openai for max_completion_tokens and the others for max_tokens", async () => {
    const secrets = secretsWith({ "openai-key": "test-key-1" });
    const openAi = await firstCall(
      openAiFactory,
      { type: "openai", secret: "openai-key" },
      secrets,
    );
    const ollama = await firstCall(ollamaFactory, { type: "ollama" });
    expect(openAi.body).toMatchObject({ max_completion_tokens: 200 });
    expect(openAi.body).not.toHaveProperty("max_tokens");
    expect(ollama.body).toMatchObject({ max_tokens: 200 });
  });

  it("sends the same requests for openai-compatible, ollama and lmstudio at one address", async () => {
    const baseUrl = "http://box.test:8080/v1";
    const calls = await Promise.all(
      [openAiCompatibleFactory, ollamaFactory, lmStudioFactory].map((factory) =>
        firstCall(factory, { type: factory.type, baseUrl }),
      ),
    );
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[2]).toEqual(calls[0]);
  });

  it("gives the provider its id and type", () => {
    const { provider } = created(ollamaFactory, { id: "local", type: "ollama" });
    expect(provider).toMatchObject({ id: "local", type: "ollama" });
  });
});
