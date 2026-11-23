import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  choiceSetup,
  fakeLine,
  lanHost,
  lanSession,
  send,
} from "./model-choice-fakes.test-helper.ts";

const anthropic = { kind: "key", provider: "anthropic" };

describe("the model choice routes", () => {
  verifies("server.model-choice-current", () => {
    it("answers what the default alias uses, or null, never from a cache", async () => {
      const { server, port } = choiceSetup();
      const sample = await send(server, "GET", "current");
      expect(sample.headers.get("cache-control")).toBe("no-store");
      expect(await sample.json()).toEqual({ current: { kind: "sample" } });
      port.only().currentModel = undefined;
      expect(await (await send(server, "GET", "current")).json()).toEqual({ current: null });
      const post = await send(server, "POST", "current");
      expect(post.status).toBe(404);
    });
  });

  verifies("server.model-choice-routes", () => {
    it("answers each route through the session's own service, never from a cache", async () => {
      const { server, port } = choiceSetup();
      const keySaved = await send(server, "GET", "key-saved/anthropic");
      expect(keySaved.headers.get("cache-control")).toBe("no-store");
      expect(await keySaved.json()).toEqual({ saved: true });
      const line = await send(server, "POST", "line-facts", { body: { choice: anthropic } });
      expect(await line.json()).toEqual({ line: fakeLine });
      const noLine = await send(server, "POST", "line-facts", {
        body: { choice: { kind: "local", model: "qwen3:8b" } },
      });
      expect(await noLine.json()).toEqual({ line: null });
      const unknown = await send(server, "GET", "preview/test_9");
      expect(await unknown.json()).toEqual({ preview: null });
      const models = await send(server, "GET", "local-models");
      expect(await models.json()).toEqual({ kind: "one", model: "llama3.2" });
      expect(port.sessions.every((session) => session === "this-computer")).toBe(true);
      expect(port.only().calls.map(([name]) => name)).toEqual([
        "keySaved",
        "lineFacts",
        "lineFacts",
        "preview",
        "localModels",
      ]);
    });

    it("keeps each signed-in session to its own service, named by a hash of its token", async () => {
      const { server, port } = choiceSetup({ password: true });
      const first = await lanSession(server);
      const second = await lanSession(server);
      await send(server, "GET", "local-models", { headers: first });
      await send(server, "GET", "key-saved/openai", { headers: second });
      const [firstSession, secondSession] = port.sessions;
      expect(port.sessions).toHaveLength(2);
      expect(firstSession).not.toBe(secondSession);
      expect(firstSession).toMatch(/^[0-9a-f]{64}$/);
      expect(first["cookie"]).not.toContain(firstSession);
      expect(port.services.get(firstSession ?? "")?.calls).toEqual([["localModels"]]);
      expect(port.services.get(secondSession ?? "")?.calls).toEqual([["keySaved", "openai"]]);
    });

    it("refuses a caller who isn't signed in before anything else", async () => {
      const { server, port } = choiceSetup({ password: true });
      const response = await send(server, "GET", "nowhere", { headers: { host: lanHost } });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: "not_signed_in" });
      expect(port.sessions).toEqual([]);
    });

    it("answers 404 model_choice_not_supported when the host passed no port", async () => {
      const { server } = choiceSetup({ port: false });
      const response = await send(server, "GET", "local-models");
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "model_choice_not_supported" });
    });

    it("answers 404 not_found for any other method, address or provider", async () => {
      const { server, port } = choiceSetup();
      for (const [method, path] of [
        ["GET", "test"],
        ["POST", "key-saved/anthropic"],
        ["GET", "key-saved/acme"],
        ["GET", "key-saved/anthropic/more"],
        ["GET", "key-saved"],
        ["GET", "local-models/more"],
        ["DELETE", "continue"],
      ] as const) {
        const response = await send(server, method, path);
        expect([path, response.status]).toEqual([path, 404]);
        expect(await response.json()).toMatchObject({ code: "not_found" });
      }
      expect(port.allCalls()).toEqual([]);
    });

    it("checks the site before the content type, and the content type before the body", async () => {
      const { server, port } = choiceSetup();
      const crossSite = await send(server, "POST", "line-facts", {
        body: "not json",
        headers: { "sec-fetch-site": "cross-site", "content-type": "text/plain" },
      });
      expect(crossSite.status).toBe(403);
      expect(await crossSite.json()).toMatchObject({ code: "from_other_site" });
      const plain = await send(server, "POST", "line-facts", {
        body: { choice: anthropic },
        headers: { "content-type": "text/plain", "sec-fetch-site": "same-origin" },
      });
      expect(plain.status).toBe(415);
      expect(await plain.json()).toMatchObject({ code: "unsupported_media_type" });
      expect(port.services.size).toBe(0);
    });

    it("refuses a body that isn't one of the choice shapes with 400 bad_request", async () => {
      const { server } = choiceSetup();
      for (const choice of [
        { kind: "key", provider: "acme" },
        { kind: "cloud", provider: "anthropic" },
        { kind: "local", model: "../etc/passwd" },
        { kind: "local", model: "x".repeat(201) },
        "anthropic",
      ]) {
        const response = await send(server, "POST", "line-facts", { body: { choice } });
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ code: "bad_request" });
      }
      const noId = await send(server, "POST", "continue", { body: { testId: "a b" } });
      expect(noId.status).toBe(400);
    });

    it("says Ollama wasn't found without the host's cause", async () => {
      const { server, port } = choiceSetup();
      port.forSession("this-computer").models = {
        kind: "not-found",
        cause: new Error("connect ECONNREFUSED 127.0.0.1:11434"),
      };
      const response = await send(server, "GET", "local-models");
      expect(await response.json()).toEqual({ kind: "not-found" });
    });

    it("logs a failing service's cause and answers a fixed 500", async () => {
      const { server, port, errors } = choiceSetup();
      const cause = new Error("the keychain at /acme/home is locked");
      port.forSession("this-computer").failWith = cause;
      const response = await send(server, "POST", "test", { body: { choice: anthropic } });
      expect(response.status).toBe(500);
      const text = await response.text();
      expect(text).toContain("internal_error");
      expect(text).not.toContain("/acme/home");
      expect(errors).toEqual([cause]);
    });
  });
});
