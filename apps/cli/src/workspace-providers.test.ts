import { type HttpClient, isModelCallError, type Secrets } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  openAiBaseUrl,
  type ProviderFile,
  WorkspaceModelError,
  workspaceProvider,
} from "./workspace-providers.ts";

/** A request the HTTP client saw. */
interface SentRequest {
  readonly url: string;
  readonly headers: Headers;
}

/**
 * An HTTP client that records each request and then fails it as a network
 * error would, so a test sees where a call went without a server.
 */
function recordingHttp(): { http: HttpClient; sent: SentRequest[] } {
  const sent: SentRequest[] = [];
  const http: HttpClient = {
    fetch: async (url, init) => {
      sent.push({ url: String(url), headers: new Headers(init?.headers) });
      throw new TypeError("fetch failed");
    },
  };
  return { http, sent };
}

/** Secrets with the given values; any other name isn't set. */
function secretsOf(values: Record<string, string>): Secrets & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    get: async (name) => {
      asked.push(name);
      return values[name] ?? null;
    },
  };
}

const hello = { model: "acme-1", messages: [{ role: "user" as const, content: "Hello" }] };

/** The model call's error, which every call to {@link recordingHttp} ends in. */
async function callError(file: ProviderFile, secrets: Secrets, http: HttpClient) {
  return await workspaceProvider(file, { secrets, http })
    .chat(hello)
    .then(
      () => undefined,
      (error: unknown) => error,
    );
}

const file = (type: string, extra: Partial<ProviderFile> = {}): ProviderFile => ({
  id: "acme",
  type,
  local: false,
  options: {},
  ...extra,
});

verifies("cli.workspace-models", () => {
  describe("a provider file's type", () => {
    it("makes the mock model, which answers without a key or the network", async () => {
      const { http, sent } = recordingHttp();
      const model = workspaceProvider(file("mock"), { secrets: secretsOf({}), http });

      expect(model.type).toBe("mock");
      expect((await model.chat(hello)).content).toBe("Hello");
      expect(sent).toEqual([]);
    });

    it("sends Anthropic calls to Anthropic with the key from the file's secret", async () => {
      const { http, sent } = recordingHttp();
      const secrets = secretsOf({ "anthropic-key": "sk-acme" });

      await callError(file("anthropic", { secret: "anthropic-key" }), secrets, http);

      expect(sent[0]?.url).toBe("https://api.anthropic.com/v1/messages");
      expect(sent[0]?.headers.get("x-api-key")).toBe("sk-acme");
    });

    it("sends OpenAI calls to OpenAI's own address without a baseUrl", async () => {
      const { http, sent } = recordingHttp();
      const secrets = secretsOf({ "openai-key": "sk-acme" });

      await callError(file("openai", { secret: "openai-key" }), secrets, http);

      expect(sent[0]?.url).toBe(`${openAiBaseUrl}/chat/completions`);
      expect(sent[0]?.headers.get("authorization")).toBe("Bearer sk-acme");
    });

    it("sends Ollama and LM Studio calls to their default address, without a key", async () => {
      for (const [type, url] of [
        ["ollama", "http://localhost:11434/v1/chat/completions"],
        ["lmstudio", "http://localhost:1234/v1/chat/completions"],
      ] as const) {
        const { http, sent } = recordingHttp();
        const error = await callError(file(type, { local: true }), secretsOf({}), http);

        expect(sent[0]?.url, type).toBe(url);
        expect(sent[0]?.headers.has("authorization"), type).toBe(false);
        expect(isModelCallError(error) && error.reason, type).toBe("offline");
      }
    });

    it("sends calls to the file's own baseUrl", async () => {
      const { http, sent } = recordingHttp();
      const acme = file("openai-compatible", { baseUrl: "http://models.acme.test/v1" });

      await callError(acme, secretsOf({}), http);

      expect(sent[0]?.url).toBe("http://models.acme.test/v1/chat/completions");
    });

    it("refuses an openai-compatible file without a baseUrl, with a fix", () => {
      const build = () => workspaceProvider(file("openai-compatible"), recordingHttpContext());

      expect(build).toThrow(WorkspaceModelError);
      expect(build).toThrow(
        expect.objectContaining({ code: "no-provider-address", kind: "not_found" }),
      );
    });

    it("refuses a type with no adapter, naming the types it knows", () => {
      const build = () => workspaceProvider(file("acme-cloud"), recordingHttpContext());

      expect(build).toThrow(
        expect.objectContaining({
          code: "unknown-provider-type",
          kind: "not_found",
          message: "provider acme has type acme-cloud, which Halonic can't call.",
          fix: "Give providers/acme.yaml one of the types anthropic, openai, openai-compatible, ollama, lmstudio or mock.",
        }),
      );
    });
  });

  describe("the key", () => {
    it("fails the call with no-key when the secret isn't set, before any request", async () => {
      const { http, sent } = recordingHttp();
      const error = await callError(
        file("anthropic", { secret: "anthropic-key" }),
        secretsOf({}),
        http,
      );

      expect(isModelCallError(error) && error.reason).toBe("no-key");
      expect(sent).toEqual([]);
    });

    it("fails an Anthropic call with no-key when the file names no secret", async () => {
      const { http } = recordingHttp();
      const error = await callError(file("anthropic"), secretsOf({}), http);

      expect(isModelCallError(error) && error.reason).toBe("no-key");
    });

    it("reads the key for each call, so a key set later is used", async () => {
      const { http, sent } = recordingHttp();
      const values: Record<string, string> = {};
      const secrets: Secrets = { get: async (name) => values[name] ?? null };
      const model = workspaceProvider(file("openai", { secret: "openai-key" }), { secrets, http });

      await model.chat(hello).catch(() => undefined);
      values["openai-key"] = "sk-acme";
      await model.chat(hello).catch(() => undefined);

      expect(sent.map((request) => request.headers.get("authorization"))).toEqual([
        "Bearer sk-acme",
      ]);
    });

    it("never reads one of Halonic's own secrets for a file that names it", async () => {
      const { http, sent } = recordingHttp();
      const secrets = secretsOf({ "token-key": "halonic-own" });

      const error = await callError(file("anthropic", { secret: "token-key" }), secrets, http);

      expect(error).toBeInstanceOf(RangeError);
      expect(secrets.asked).toEqual([]);
      expect(sent).toEqual([]);
    });
  });
});

function recordingHttpContext() {
  return { secrets: secretsOf({}), http: recordingHttp().http };
}
