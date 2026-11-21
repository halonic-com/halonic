import { AgentHostError } from "@halonicjs/adapter-agent-host-client";
import { EngineNotAnswering } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { AgentHostNotAnswering } from "./agent-host-not-answering.ts";
import { TauriAgentHostTransport, tauriAgentHostTransport } from "./agent-host-transport.ts";
import { FakeShell } from "./fake-shell.test-helper.ts";

const health = "GET /v1/health";

verifies("services.agent-host-transport", () => {
  describe("TauriAgentHostTransport.securityUpdates", () => {
    it("reads the shell's answer, null for a host beside the shell, and refuses another shape", async () => {
      const answers: unknown[] = [
        { overdue: true, last: "2026-11-01T00:00:00Z", isDefaultDistro: true },
        { overdue: false, isDefaultDistro: "yes" },
        null,
        { overdue: 1 },
      ];
      const shell = new FakeShell().answer("agent_host_security_updates", () => answers.shift());
      const transport = new TauriAgentHostTransport(shell);

      await expect(transport.securityUpdates()).resolves.toEqual({
        overdue: true,
        last: "2026-11-01T00:00:00Z",
        isDefaultDistro: true,
      });
      await expect(transport.securityUpdates()).resolves.toEqual({
        overdue: false,
        last: null,
        isDefaultDistro: false,
      });
      await expect(transport.securityUpdates()).resolves.toBeNull();
      await expect(transport.securityUpdates()).rejects.toMatchObject({ kind: "answer_invalid" });
    });
  });

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
        throw { kind: "unknown_route", message: "not a route of the agent host" };
      });

      const failure = new TauriAgentHostTransport(shell).request(health);

      await expect(failure).rejects.toBeInstanceOf(AgentHostError);
      await expect(failure).rejects.toMatchObject({
        status: 0,
        kind: "unknown_route",
        message: expect.stringContaining("not a route of the agent host"),
      });
    });

    it("keeps the sandbox reason the shell gives for a host it can't start", async () => {
      const shell = new FakeShell().answer("agent_host_request", () => {
        throw { kind: "host_unavailable", reason: "distro-missing", message: "no distro" };
      });

      await expect(new TauriAgentHostTransport(shell).request(health)).rejects.toMatchObject({
        code: "host_unavailable",
        reason: "distro-missing",
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

verifies("services.agent-host-not-answering", () => {
  const notRunning = { kind: "host_unavailable", message: "the agent host didn't start" };

  it("rejects a call to a host that isn't running as the engine not answering", async () => {
    const shell = new FakeShell().answer("agent_host_request", () => {
      throw notRunning;
    });

    const refused = await new TauriAgentHostTransport(shell)
      .request(health)
      .catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(EngineNotAnswering);
    expect(refused).toBeInstanceOf(AgentHostNotAnswering);
    expect(refused).toMatchObject({
      kind: "unavailable",
      status: 0,
      code: "host_unavailable",
      reason: undefined,
    });
    // The shell's words stay in the log, never in the message a screen may show.
    expect((refused as Error).message).not.toContain("agent host");
    expect((refused as AgentHostNotAnswering).cause).toBeInstanceOf(AgentHostError);
    expect((refused as AgentHostNotAnswering).cause.message).toContain("didn't start");
  });

  it("rejects a stream the shell can't open for that reason the same way", async () => {
    const shell = new FakeShell().answer("agent_host_stream", () => {
      throw notRunning;
    });

    const refused = new TauriAgentHostTransport(shell).stream(
      "POST /v1/bridge/open",
      {},
      { signal: new AbortController().signal },
    );

    await expect(refused).rejects.toBeInstanceOf(EngineNotAnswering);
  });
});

verifies("services.shell-sandbox-choice-save", () => {
  const save = "agent_host_sandbox_choice_save";

  it("sends the backend, or null to remove the choice, and returns the host's answer", async () => {
    const answer = { status: 200, body: { active: "srt" } };
    const shell = new FakeShell().answer(save, () => answer);
    const transport = new TauriAgentHostTransport(shell);

    await expect(transport.saveSandboxChoice("srt")).resolves.toEqual(answer);
    await expect(transport.saveSandboxChoice(null)).resolves.toEqual(answer);
    expect(shell.callsOf(save)).toEqual([{ backend: "srt" }, { backend: null }]);
  });

  it("rejects with the shell's kind when it refuses the backend", async () => {
    const shell = new FakeShell().answer(save, () => {
      throw { kind: "invalid_choice", message: "not a sandbox backend" };
    });

    await expect(new TauriAgentHostTransport(shell).saveSandboxChoice("odd")).rejects.toMatchObject(
      { status: 0, kind: "invalid_choice" },
    );
  });

  it("refuses an answer that isn't the host's answer", async () => {
    const shell = new FakeShell().answer(save, () => ({ saved: true }));

    await expect(new TauriAgentHostTransport(shell).saveSandboxChoice("srt")).rejects.toMatchObject(
      { kind: "answer_invalid" },
    );
  });
});
