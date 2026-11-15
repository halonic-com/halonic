import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeShell } from "./fake-shell.test-helper.ts";
import { shellHttpClient } from "./shell-http.ts";

const answer =
  (status: number, body = "") =>
  () => ({
    status,
    headers: [["content-type", "application/json"]],
    body,
  });

verifies("services.shell-http", () => {
  describe("shellHttpClient", () => {
    it("sends the request through the shell and answers its response", async () => {
      const shell = new FakeShell().answer("http_request", answer(200, '{"ok":true}'));

      const response = await shellHttpClient(shell).fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "X-Api-Key": "example" },
        body: '{"a":1}',
      });

      expect(shell.calls[0]?.args).toEqual({
        request: {
          url: "https://api.anthropic.com/v1/messages",
          method: "POST",
          headers: [["x-api-key", "example"]],
          body: '{"a":1}',
        },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(await response.json()).toEqual({ ok: true });
    });

    it("answers a status that carries no body", async () => {
      const shell = new FakeShell().answer("http_request", answer(204));

      const response = await shellHttpClient(shell).fetch("https://api.openai.com/v1");

      expect(response.status).toBe(204);
      expect(shell.calls[0]?.args["request"]).toMatchObject({ method: "GET", body: null });
    });

    it("refuses a body that is not text without calling the shell", async () => {
      const shell = new FakeShell().answer("http_request", answer(200));

      await expect(
        shellHttpClient(shell).fetch("https://api.openai.com/v1", {
          method: "POST",
          body: new Uint8Array([1]),
        }),
      ).rejects.toBeInstanceOf(TypeError);
      expect(shell.calls).toEqual([]);
    });

    it("fails with the shell's words when it refuses", async () => {
      const shell = new FakeShell().answer("http_request", () => {
        throw { kind: "host_refused", message: "example.com is not a model provider host" };
      });

      await expect(shellHttpClient(shell).fetch("https://example.com/")).rejects.toThrow(
        "example.com is not a model provider host",
      );
    });

    it("words a refusal that is plain text or unknown", async () => {
      for (const [refusal, words] of [
        ["command http_request not allowed", "command http_request not allowed"],
        [42, "The shell refused the request."],
      ] as const) {
        const shell = new FakeShell().answer("http_request", () => {
          throw refusal;
        });

        await expect(shellHttpClient(shell).fetch("https://example.com/")).rejects.toThrow(words);
      }
    });

    it("stops waiting when the signal aborts", async () => {
      const shell = new FakeShell().answer("http_request", () => new Promise(() => {}));
      const controller = new AbortController();

      const pending = shellHttpClient(shell).fetch("https://api.openai.com/v1", {
        signal: controller.signal,
      });
      controller.abort(new Error("too slow"));

      await expect(pending).rejects.toThrow("too slow");
    });

    it("fails a redirect only when the caller asked it to", async () => {
      const shell = new FakeShell().answer("http_request", answer(302));
      const client = shellHttpClient(shell);

      await expect(
        client.fetch("https://api.openai.com/v1", { redirect: "error" }),
      ).rejects.toBeInstanceOf(TypeError);
      const manual = await client.fetch("https://api.openai.com/v1", { redirect: "manual" });
      expect(manual.status).toBe(302);
    });
  });
});
