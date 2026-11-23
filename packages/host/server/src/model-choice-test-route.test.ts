import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { choiceSetup, lanSession, send } from "./model-choice-fakes.test-helper.ts";

const canaryKey = "sk-ant-canary-key-5678";
const anthropic = { kind: "key", provider: "anthropic" };

describe("the model choice test route", () => {
  verifies("server.model-choice-test", () => {
    it("builds the choice anew, so the browser can't name an address", async () => {
      const { server, port } = choiceSetup();
      const response = await send(server, "POST", "test", {
        body: {
          choice: { ...anthropic, baseUrl: "https://evil.example", model: "other" },
          key: canaryKey,
          address: "https://evil.example",
        },
      });
      expect(await response.json()).toEqual({ kind: "tested", outcome: "ok", testId: "test_1" });
      expect(port.only().calls).toEqual([["test", anthropic, canaryKey]]);
    });

    it("tests with the saved key when no key is sent", async () => {
      const { server, port } = choiceSetup();
      await send(server, "POST", "test", { body: { choice: anthropic } });
      expect(port.only().calls).toEqual([["test", anthropic, undefined]]);
    });

    it("takes a key only as a string of at most 1,024 characters, with a key choice", async () => {
      const { server, port } = choiceSetup();
      for (const body of [
        { choice: { kind: "local", model: "llama3.2" }, key: canaryKey },
        { choice: anthropic, key: 1234 },
        { choice: anthropic, key: `sk-ant-${"x".repeat(1018)}` },
      ]) {
        const response = await send(server, "POST", "test", { body });
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ code: "bad_request" });
      }
      expect(port.allCalls()).toEqual([]);
    });

    it("refuses a key over plain http to a LAN name, and tests one over HTTPS", async () => {
      const { server, port } = choiceSetup({ password: true });
      const body = { choice: anthropic, key: canaryKey };
      const plain = await send(server, "POST", "test", { body, headers: await lanSession(server) });
      expect(plain.status).toBe(403);
      expect(await plain.json()).toMatchObject({ code: "secure_connection_required" });
      expect(port.allCalls()).toEqual([]);
      const headers = await lanSession(server, true);
      const secure = await send(server, "POST", "test", { body, headers, secure: true });
      expect(secure.status).toBe(200);
    });

    it("tests a local model over plain http to a LAN name, since no key travels", async () => {
      const { server, port } = choiceSetup({ password: true });
      const session = await lanSession(server);
      const local = { kind: "local", model: "hf.co/acme/tiny-model:Q4_K_M" };
      const response = await send(server, "POST", "test", {
        body: { choice: local },
        headers: session,
      });
      expect(response.status).toBe(200);
      expect(port.only().calls).toEqual([["test", local, undefined]]);
    });

    it("lets a session start 10 tests per 15 minutes, apart from other sessions", async () => {
      const { server, port, clock } = choiceSetup({ password: true });
      const first = await lanSession(server);
      const second = await lanSession(server);
      const body = { choice: { kind: "local", model: "llama3.2" } };
      for (let test = 0; test < 10; test += 1) {
        expect((await send(server, "POST", "test", { body, headers: first })).status).toBe(200);
      }
      const refused = await send(server, "POST", "test", { body, headers: first });
      expect(refused.status).toBe(429);
      expect(refused.headers.get("retry-after")).toBe("900");
      expect(await refused.json()).toMatchObject({ code: "too_many_tests" });
      expect((await send(server, "POST", "test", { body, headers: second })).status).toBe(200);
      clock.advance(15 * 60 * 1000);
      expect((await send(server, "POST", "test", { body, headers: first })).status).toBe(200);
      const tests = [...port.services.values()].map((service) => service.calls.length);
      expect(tests.sort()).toEqual([1, 11]);
    });

    it("keeps the key out of every answer and log, and the test out of the request log", async () => {
      const { server, port, requestLog, errors } = choiceSetup();
      const service = port.forSession("this-computer");
      service.testOutcome = { kind: "tested", outcome: "key-refused" };
      const tested = await send(server, "POST", "test", {
        body: { choice: anthropic, key: canaryKey },
      });
      service.failWith = new Error("the provider is down");
      const failed = await send(server, "POST", "test", {
        body: { choice: anthropic, key: canaryKey },
      });
      await send(server, "GET", "local-models");
      for (const response of [tested, failed]) {
        expect(await response.text()).not.toContain(canaryKey);
      }
      expect(JSON.stringify([requestLog, errors.map(String)])).not.toContain(canaryKey);
      expect(requestLog).toEqual([
        { method: "GET", path: "/api/model-choice/local-models", status: 200 },
      ]);
    });
  });
});

describe("the model choice and the workspace's trust", () => {
  verifies("server.model-choice-no-trust", () => {
    it("continues with no shown fingerprint, whatever the body holds", async () => {
      const { server, port } = choiceSetup();
      const response = await send(server, "POST", "continue", {
        body: { testId: "test_1", shownFingerprint: "sha256:fake" },
      });
      expect(await response.json()).toEqual({ ok: true, changes: [], trusted: false });
      expect(port.only().calls).toEqual([["continue", "test_1", undefined]]);
    });

    it("previews the trust line without its fingerprint", async () => {
      const { server } = choiceSetup();
      const body = await (await send(server, "GET", "preview/test_1")).json();
      expect(body).toEqual({
        preview: { reaches: { name: "Anthropic", secrets: 1, local: false }, localOnlyOff: true },
      });
      expect(JSON.stringify(body)).not.toContain("fingerprint");
    });

    it("answers a failed step without its reason, which goes to the error log", async () => {
      const { server, port, errors } = choiceSetup();
      port.forSession("this-computer").saved = {
        ok: false,
        failed: "write",
        keySaved: true,
        reason: "EACCES: /acme/home/workspace/models.yaml",
      };
      const response = await send(server, "POST", "continue", { body: { testId: "test_1" } });
      expect(await response.json()).toEqual({ ok: false, failed: "write", keySaved: true });
      expect(String(errors[0])).toContain("/acme/home/workspace/models.yaml");
    });

    it("leaves the error log alone for a test that is gone", async () => {
      const { server, port, errors } = choiceSetup();
      port.forSession("this-computer").saved = {
        ok: false,
        failed: "no-test",
        keySaved: false,
        reason: "No passed test has this id.",
      };
      const response = await send(server, "POST", "continue", { body: { testId: "test_2" } });
      expect(await response.json()).toEqual({ ok: false, failed: "no-test", keySaved: false });
      expect(errors).toEqual([]);
    });
  });

  verifies("server.model-choice-not-committed", () => {
    it("names the choice files that aren't committed, and nothing else of the reason", async () => {
      const { server, port, errors } = choiceSetup();
      port.forSession("this-computer").saved = {
        ok: false,
        failed: "not-committed",
        files: ["models.yaml", "../acme/home/notes.md", "providers/anthropic.yaml"],
        keySaved: true,
        reason: "Couldn't save: models.yaml has changes that aren't committed.",
      };
      const response = await send(server, "POST", "continue", { body: { testId: "test_1" } });
      expect(await response.json()).toEqual({
        ok: false,
        failed: "not-committed",
        keySaved: true,
        files: ["models.yaml", "providers/anthropic.yaml"],
      });
      expect(errors).toEqual([]);
    });
  });
});
