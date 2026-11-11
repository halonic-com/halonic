import { AgentHostError } from "@halonicjs/adapter-agent-host-client";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { TauriAgentHostTransport, tauriAgentHostTransport } from "./agent-host-transport.ts";
import { FakeShell } from "./fake-shell.test-helper.ts";

const health = "GET /v1/health";

verifies("services.agent-host-transport", () => {
  describe("TauriAgentHostTransport.request", () => {
    it("calls agent_host_request with the route and body, and returns the host's answer", async () => {
      const shell = new FakeShell().answer("agent_host_request", () => ({
        status: 200,
        body: { ok: true },
      }));

      const answer = await new TauriAgentHostTransport(shell).request(health);

      expect(answer).toEqual({ status: 200, body: { ok: true } });
      expect(shell.callsOf("agent_host_request")).toEqual([{ route: health, body: undefined }]);
    });

    it("passes on the host's own refusal as an answer", async () => {
      const refusal = { status: 404, body: { error: { kind: "unknown_session" } } };
      const shell = new FakeShell().answer("agent_host_request", () => refusal);

      const answer = await new TauriAgentHostTransport(shell).request(
        "POST /v1/sandbox/sessions/close",
        { session: "s1" },
      );

      expect(answer).toEqual(refusal);
    });

    it("turns the shell's refusal into an AgentHostError with status 0 and its kind", async () => {
      const shell = new FakeShell().answer("agent_host_request", () => {
        throw { kind: "host_unavailable", message: "the agent host didn't start" };
      });

      const failure = new TauriAgentHostTransport(shell).request(health);

      await expect(failure).rejects.toBeInstanceOf(AgentHostError);
      await expect(failure).rejects.toMatchObject({
        status: 0,
        kind: "host_unavailable",
        message: expect.stringContaining("the agent host didn't start"),
      });
    });

    it.each([
      ["a kind without a message", { kind: "io" }, "io", /: io\./],
      ["an Error", new Error("IPC gone"), "shell_failed", /IPC gone/],
      ["a string", "command not allowed", "shell_failed", /command not allowed/],
    ])("turns %s from the shell into an AgentHostError", async (_, thrown, kind, message) => {
      const shell = new FakeShell().answer("agent_host_request", () => {
        throw thrown;
      });

      await expect(new TauriAgentHostTransport(shell).request(health)).rejects.toMatchObject({
        status: 0,
        kind,
        message: expect.stringMatching(message),
      });
    });

    it("turns a command the shell doesn't allow on this page into an AgentHostError", async () => {
      await expect(
        new TauriAgentHostTransport(new FakeShell()).request(health),
      ).rejects.toMatchObject({
        kind: "shell_failed",
        message: expect.stringContaining("not allowed"),
      });
    });

    it.each([
      ["null", null],
      ["without a status", { body: {} }],
      ["without a body", { status: 200 }],
    ])("refuses an answer from the shell that is %s", async (_, answer) => {
      const shell = new FakeShell().answer("agent_host_request", () => answer);

      await expect(new TauriAgentHostTransport(shell).request(health)).rejects.toMatchObject({
        kind: "answer_invalid",
      });
    });

    it("stops waiting when the signal aborts, with its reason", async () => {
      const shell = new FakeShell().answer("agent_host_request", () => new Promise(() => {}));
      const caller = new AbortController();

      const call = new TauriAgentHostTransport(shell).request(health, undefined, {
        signal: caller.signal,
      });
      caller.abort(new Error("gave up"));

      await expect(call).rejects.toThrow("gave up");
    });

    it("doesn't call the shell for a signal that has already aborted", async () => {
      const shell = new FakeShell();

      const call = new TauriAgentHostTransport(shell).request(health, undefined, {
        signal: AbortSignal.abort(new Error("too late")),
      });

      await expect(call).rejects.toThrow("too late");
      expect(shell.calls).toEqual([]);
    });

    it("waits for the answer under a signal that doesn't abort", async () => {
      const shell = new FakeShell().answer("agent_host_request", () => ({ status: 200, body: 1 }));

      const answer = await new TauriAgentHostTransport(shell).request(health, undefined, {
        signal: new AbortController().signal,
      });

      expect(answer).toEqual({ status: 200, body: 1 });
    });
  });

  describe("tauriAgentHostTransport", () => {
    it("finds no transport on a page outside the shell", () => {
      expect(tauriAgentHostTransport({})).toBeUndefined();
    });

    it("finds the shell's transport on a page in the shell", () => {
      expect(tauriAgentHostTransport({ __TAURI_INTERNALS__: new FakeShell() })).toBeInstanceOf(
        TauriAgentHostTransport,
      );
    });
  });
});
