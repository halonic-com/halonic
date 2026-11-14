import type { ChatTurnRequest, Coordination, RunExecutor } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { ModelSettingsGate, Server, TrustDecision, TrustGate } from "./api.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const trusted: TrustDecision = { state: "trusted", message: "Trusted." };
const host = "halonic.acme.example";
const hostOf = new WeakMap<Server, string>();
const answer = {
  content: "Hello",
  toolCalls: [],
  usage: { inputTokens: 1, outputTokens: 1 },
  finishReason: "stop",
  model: "test-model",
};
const valid = {
  hubId: "main",
  messages: [{ role: "user", content: "Hi" }],
  tools: [{ name: "lookup", description: "Looks up.", parameters: { type: "object" } }],
};

const setupWithGate = (allows: ModelSettingsGate["allows"]) => setup({ modelSettings: { allows } });

interface Calls {
  turns: ChatTurnRequest[];
  logged: unknown[];
}

function setup(
  options: {
    state?: TrustDecision;
    passwordHash?: string | null;
    chatTurn?: (request: ChatTurnRequest) => Promise<unknown>;
    modelSettings?: ModelSettingsGate;
  } = {},
) {
  const calls: Calls = { turns: [], logged: [] };
  const runs = {
    chatTurn: async (request: ChatTurnRequest) => {
      calls.turns.push(request);
      return options.chatTurn === undefined ? answer : options.chatTurn(request);
    },
  } as unknown as RunExecutor;
  const trust: TrustGate = { check: async () => options.state ?? trusted };
  const clock = new TestClock();
  const server = testServer({
    passwordHash: options.passwordHash ?? null,
    clock,
    runs,
    trust,
    ...(options.modelSettings === undefined ? {} : { modelSettings: options.modelSettings }),
    errorLog: { record: (error) => calls.logged.push(error) },
    passwordHasher: new FakePasswordHasher(),
    coordination: new FakeCoordination(clock) as unknown as Coordination,
    config: { allowedHosts: [host], maxBodyBytes: 4096 },
  });
  hostOf.set(
    server,
    options.passwordHash === undefined || options.passwordHash === null ? "localhost" : host,
  );
  return { server, calls };
}

function post(
  server: Server,
  path: string,
  options: {
    body?: unknown;
    type?: string;
    cookie?: string;
    rawBody?: string;
    signal?: AbortSignal;
  } = {},
): Promise<Response> {
  const name = hostOf.get(server) ?? "localhost";
  const headers: Record<string, string> = { host: name };
  if (options.type !== "") headers["content-type"] = options.type ?? "application/json";
  if (options.cookie !== undefined) headers["cookie"] = options.cookie;
  return server.handle(
    new Request(`https://${name}${path}`, {
      method: "POST",
      headers,
      body: options.rawBody ?? JSON.stringify(options.body ?? {}),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    }),
  );
}

const turn = (server: Server, body: unknown, rest: Parameters<typeof post>[2] = {}) =>
  post(server, "/api/chat-turn", { ...rest, body });

async function codeOf(response: Response): Promise<string> {
  return ((await response.json()) as { code: string }).code;
}

describe("chat turn route", () => {
  verifies("server.chat-turn", () => {
    it("forwards a valid turn with the request's signal and answers the response", async () => {
      const { server, calls } = setup();
      const response = await turn(server, {
        ...valid,
        alias: "smart",
        agentId: "writer",
        params: { temperature: 0.2, reasoningEffort: "low" },
        agent: { type: "openai", model: "gpt-x", secret: "openai-key", local: false },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(answer);
      expect(calls.turns).toHaveLength(1);
      expect(calls.turns[0]).toMatchObject({
        ...valid,
        alias: "smart",
        agentId: "writer",
        params: { temperature: 0.2, reasoningEffort: "low" },
        agent: { type: "openai", model: "gpt-x", secret: "openai-key", local: false },
      });
      expect(calls.turns[0]?.signal).toBeInstanceOf(AbortSignal);
    });

    it("refuses a body that isn't a chat turn with 400 before the executor is asked", async () => {
      const { server, calls } = setup();
      const bad: unknown[] = [
        "not an object",
        [],
        {},
        { ...valid, hubId: "" },
        { ...valid, messages: [{ role: "robot", content: "x" }] },
        { ...valid, messages: [{ role: "user" }] },
        { ...valid, messages: [{ role: "tool", content: "x", name: "t" }] },
        { ...valid, tools: [{ name: "t" }] },
        { ...valid, params: { temperature: "hot" } },
        { ...valid, params: { reasoningEffort: "max" } },
        { ...valid, agent: { type: "openai", model: "m" } },
        { ...valid, signal: {} },
        { ...valid, extra: 1 },
      ];
      for (const body of bad) {
        const response = await turn(server, body);
        expect(response.status).toBe(400);
        expect(await codeOf(response)).toBe("bad_request");
      }
      expect((await post(server, "/api/chat-turn", { rawBody: "{nope" })).status).toBe(400);
      expect(calls.turns).toEqual([]);
    });

    it("carries only the secret's name: a key in the settings refuses the request", async () => {
      const { server, calls } = setup();
      const response = await turn(server, {
        ...valid,
        agent: { type: "openai", model: "m", local: false, apiKey: "sk-abc" },
      });
      expect(response.status).toBe(400);
      expect(JSON.stringify(await response.json())).not.toContain("sk-abc");
      expect(calls.turns).toEqual([]);
    });

    it("refuses a secret name that isn't one a model setting may use", async () => {
      const { server, calls } = setup();
      for (const secret of [
        "serve-password",
        "Serve_Password",
        "token-key",
        "halonic_token_google",
        "plugin__weather__key",
        "not a name",
        "sk-abc/../x",
      ]) {
        const response = await turn(server, {
          ...valid,
          agent: {
            type: "openai",
            model: "m",
            baseUrl: "https://evil.example",
            secret,
            local: false,
          },
        });
        expect(response.status).toBe(400);
        expect(await codeOf(response)).toBe("secret_name_not_allowed");
      }
      expect(calls.turns).toEqual([]);
    });

    it("refuses a cross-site form POST that has the session cookie but no Origin", async () => {
      const { server, calls } = setup({ passwordHash: "hash:correct horse" });
      const login = await post(server, "/api/login", { body: { password: "correct horse" } });
      const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
      for (const type of [
        "application/x-www-form-urlencoded",
        "multipart/form-data; boundary=x",
        "text/plain",
        "",
      ]) {
        const response = await post(server, "/api/chat-turn", {
          type,
          cookie,
          rawBody: "hubId=main",
        });
        expect(response.status).toBe(415);
        expect(await codeOf(response)).toBe("unsupported_media_type");
      }
      expect(calls.turns).toEqual([]);
    });

    it("needs a sign-in when a password is set", async () => {
      const { server, calls } = setup({ passwordHash: "hash:correct horse" });
      expect((await turn(server, valid)).status).toBe(401);
      expect(calls.turns).toEqual([]);
      const login = await post(server, "/api/login", { body: { password: "correct horse" } });
      const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
      expect((await turn(server, valid, { cookie })).status).toBe(200);
    });

    it("refuses a POST from another origin, a foreign Host and a body over the limit", async () => {
      const { server, calls } = setup();
      const foreignOrigin = await server.handle(
        new Request("https://localhost/api/chat-turn", {
          method: "POST",
          headers: {
            host: "localhost",
            origin: "https://evil.example",
            "content-type": "application/json",
          },
          body: JSON.stringify(valid),
        }),
      );
      expect(foreignOrigin.status).toBe(403);
      const foreignHost = await server.handle(
        new Request("https://evil.example/api/chat-turn", {
          method: "POST",
          headers: { host: "evil.example", "content-type": "application/json" },
          body: JSON.stringify(valid),
        }),
      );
      expect(foreignHost.status).toBe(421);
      const tooLarge = await turn(server, {
        ...valid,
        messages: [{ role: "user", content: "x".repeat(5000) }],
      });
      expect(tooLarge.status).toBe(413);
      expect(calls.turns).toEqual([]);
    });

    it("needs a trusted workspace, and has no route that grants trust", async () => {
      for (const state of ["new", "changed", "unreadable", "refused"] as const) {
        const { server, calls } = setup({ state: { state, message: "No." } });
        const response = await turn(server, valid);
        expect(response.status).toBe(403);
        expect(await codeOf(response)).toBe("workspace_not_trusted");
        expect(calls.turns).toEqual([]);
      }
    });

    it("aborts the model call when the caller closes the request, and logs no error", async () => {
      const controller = new AbortController();
      let executorSignal: AbortSignal | undefined;
      const { server, calls } = setup({
        chatTurn: (request) =>
          new Promise((_resolve, reject) => {
            executorSignal = request.signal;
            request.signal?.addEventListener("abort", () => reject(new Error("aborted")));
            controller.abort();
          }),
      });
      const response = await turn(server, valid, { signal: controller.signal });
      expect(executorSignal?.aborted).toBe(true);
      expect(response.status).toBe(499);
      expect(await codeOf(response)).toBe("request_aborted");
      expect(calls.logged).toEqual([]);
    });

    it("answers 502 model_call_failed with a fixed message and keeps the cause in the log", async () => {
      const cause = new Error("key sk-abc rejected by https://llm.internal");
      const { server, calls } = setup({
        chatTurn: async () => {
          throw cause;
        },
      });
      const response = await turn(server, valid);
      expect(response.status).toBe(502);
      const text = JSON.stringify(await response.json());
      expect(text).toContain("model_call_failed");
      expect(text).not.toContain("sk-abc");
      expect(text).not.toContain("llm.internal");
      expect(calls.logged).toEqual([cause]);
    });
  });
});

describe("chat turn model address", () => {
  verifies("server.chat-turn-model-address", () => {
    it("refuses settings the gate doesn't allow, before the trust gate and the executor", async () => {
      const asked: unknown[] = [];
      const { server, calls } = setupWithGate(async (hubId, settings) => {
        asked.push([hubId, settings]);
        return false;
      });
      const response = await turn(server, {
        ...valid,
        agent: {
          type: "openai",
          model: "m",
          baseUrl: "https://other.example/v1",
          secret: "openai-key",
          local: false,
        },
      });
      expect(response.status).toBe(400);
      expect(await codeOf(response)).toBe("model_address_not_allowed");
      expect(asked).toHaveLength(1);
      expect(calls.turns).toEqual([]);
    });

    it("forwards settings the gate allows, and doesn't ask for settings without a secret", async () => {
      const asked: unknown[] = [];
      const { server, calls } = setupWithGate(async (...args) => {
        asked.push(args);
        return true;
      });
      const withSecret = { type: "openai", model: "m", secret: "openai-key", local: false };
      expect((await turn(server, { ...valid, agent: withSecret })).status).toBe(200);
      expect(
        (await turn(server, { ...valid, agent: { type: "ollama", model: "m", local: true } }))
          .status,
      ).toBe(200);
      expect(asked).toHaveLength(1);
      expect(calls.turns).toHaveLength(2);
    });
  });
});
