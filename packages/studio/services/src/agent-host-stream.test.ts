import type { AgentHostStreamAnswer } from "@halonicjs/adapter-agent-host-client";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { TauriAgentHostTransport } from "./agent-host-transport.ts";
import { FakeShell } from "./fake-shell.test-helper.ts";

const blocked = "POST /v1/sandbox/sessions/blocked";

/** A shell whose `agent_host_stream` opens every stream; `channels` holds each one's argument. */
function streamingShell(): { shell: FakeShell; channels: string[] } {
  const channels: string[] = [];
  const shell = new FakeShell()
    .answer("agent_host_stream", (args) => {
      channels.push(String(args["channel"]));
      return { stream: args["stream"] };
    })
    .answer("agent_host_stream_end", () => null);
  return { shell, channels };
}

/** Sends the stream messages `messages` on `channel`, numbered from 0. */
function sendAll(shell: FakeShell, channel: string, messages: unknown[]): void {
  for (const [index, message] of messages.entries()) {
    shell.send(channel, { index, message });
  }
}

async function readAll(answer: AgentHostStreamAnswer): Promise<unknown[]> {
  if (!answer.ok) throw new Error("The stream was refused.");
  const lines: unknown[] = [];
  for await (const line of answer.lines) lines.push(line);
  return lines;
}

verifies("services.agent-host-transport", () => {
  describe("TauriAgentHostTransport.stream", () => {
    it("reads the lines the shell sends until end, and leaves no callback behind", async () => {
      const { shell, channels } = streamingShell();

      const answer = await new TauriAgentHostTransport(shell).stream(
        blocked,
        { session: "s1" },
        { signal: new AbortController().signal },
      );
      const channel = channels[0] as string;
      sendAll(shell, channel, [
        { type: "line", line: { path: "/a" } },
        { type: "line", line: { path: "/b" } },
        { type: "end" },
      ]);

      expect(await readAll(answer)).toEqual([{ path: "/a" }, { path: "/b" }]);
      const [start] = shell.callsOf("agent_host_stream");
      expect(start).toMatchObject({ route: blocked, body: { session: "s1" }, channel });
      expect(shell.registered(channel)).toBe(false);
      expect(shell.callsOf("agent_host_stream_end")).toEqual([]);
    });

    it("gives each stream its own id", async () => {
      const { shell } = streamingShell();
      const transport = new TauriAgentHostTransport(shell);
      const signal = new AbortController().signal;

      await transport.stream(blocked, {}, { signal });
      await transport.stream(blocked, {}, { signal });

      const [first, second] = shell.callsOf("agent_host_stream").map((args) => args["stream"]);
      expect(typeof first).toBe("number");
      expect(second).not.toBe(first);
    });

    it("throws the shell's failure message from the lines", async () => {
      const { shell, channels } = streamingShell();

      const answer = await new TauriAgentHostTransport(shell).stream(
        blocked,
        {},
        {
          signal: new AbortController().signal,
        },
      );
      sendAll(shell, channels[0] as string, [
        { type: "line", line: 1 },
        { type: "failed", message: "the agent host's stream broke off" },
      ]);

      await expect(readAll(answer)).rejects.toMatchObject({
        kind: "stream_failed",
        message: "the agent host's stream broke off",
      });
    });

    it("ends the lines and hangs up when the caller aborts", async () => {
      const { shell, channels } = streamingShell();
      const caller = new AbortController();

      const answer = await new TauriAgentHostTransport(shell).stream(
        blocked,
        {},
        {
          signal: caller.signal,
        },
      );
      sendAll(shell, channels[0] as string, [{ type: "line", line: 1 }]);
      caller.abort();

      expect(await readAll(answer)).toEqual([1]);
      const [start] = shell.callsOf("agent_host_stream");
      expect(shell.callsOf("agent_host_stream_end")).toEqual([{ stream: start?.["stream"] }]);
      expect(shell.registered(channels[0] as string)).toBe(false);
    });

    it("hangs up when the caller stops reading before the end", async () => {
      const { shell, channels } = streamingShell();

      const answer = await new TauriAgentHostTransport(shell).stream(
        blocked,
        {},
        {
          signal: new AbortController().signal,
        },
      );
      sendAll(shell, channels[0] as string, [
        { type: "line", line: 1 },
        { type: "line", line: 2 },
      ]);
      if (!answer.ok) throw new Error("The stream was refused.");
      for await (const _ of answer.lines) break;

      expect(shell.callsOf("agent_host_stream_end")).toHaveLength(1);
    });

    it.each([
      ["that isn't an object", "line"],
      ["of an unknown type", { type: "lines" }],
    ])("hangs up and throws on a message %s", async (_, message) => {
      const { shell, channels } = streamingShell();

      const answer = await new TauriAgentHostTransport(shell).stream(
        blocked,
        {},
        {
          signal: new AbortController().signal,
        },
      );
      sendAll(shell, channels[0] as string, [message]);

      await expect(readAll(answer)).rejects.toMatchObject({ kind: "answer_invalid" });
      expect(shell.callsOf("agent_host_stream_end")).toHaveLength(1);
    });

    it("hangs up even when the shell refuses agent_host_stream_end", async () => {
      const { shell, channels } = streamingShell();
      shell.answer("agent_host_stream_end", () => {
        throw "gone";
      });
      const caller = new AbortController();

      const answer = await new TauriAgentHostTransport(shell).stream(
        blocked,
        {},
        {
          signal: caller.signal,
        },
      );
      caller.abort();

      expect(await readAll(answer)).toEqual([]);
      expect(shell.registered(channels[0] as string)).toBe(false);
    });

    it("passes on the host's refusal of the stream as an answer, and closes the channel", async () => {
      const refusal = { status: 404, body: { error: { kind: "unknown_session" } } };
      const channels: string[] = [];
      const shell = new FakeShell().answer("agent_host_stream", (args) => {
        channels.push(String(args["channel"]));
        return { answer: refusal };
      });

      const answer = await new TauriAgentHostTransport(shell).stream(
        blocked,
        {},
        {
          signal: new AbortController().signal,
        },
      );

      expect(answer).toEqual({ ok: false, answer: refusal });
      expect(shell.registered(channels[0] as string)).toBe(false);
    });

    it("turns the shell's refusal into an AgentHostError and closes the channel", async () => {
      const channels: string[] = [];
      const shell = new FakeShell().answer("agent_host_stream", (args) => {
        channels.push(String(args["channel"]));
        throw { kind: "stream_in_use", message: "the page already has stream 1" };
      });

      const failure = new TauriAgentHostTransport(shell).stream(
        blocked,
        {},
        {
          signal: new AbortController().signal,
        },
      );

      await expect(failure).rejects.toMatchObject({ status: 0, kind: "stream_in_use" });
      expect(shell.registered(channels[0] as string)).toBe(false);
      expect(shell.callsOf("agent_host_stream_end")).toEqual([]);
    });

    it("hangs up and throws the reason when the caller aborts before the shell answers", async () => {
      const shell = new FakeShell()
        .answer("agent_host_stream", () => new Promise(() => {}))
        .answer("agent_host_stream_end", () => null);
      const caller = new AbortController();

      const start = new TauriAgentHostTransport(shell).stream(
        blocked,
        {},
        {
          signal: caller.signal,
        },
      );
      caller.abort(new Error("gave up"));

      await expect(start).rejects.toThrow("gave up");
      expect(shell.callsOf("agent_host_stream_end")).toHaveLength(1);
    });

    it.each([
      ["null", null],
      ["another stream's id", { stream: -1 }],
    ])("hangs up on a start answer that is %s", async (_, start) => {
      const shell = new FakeShell()
        .answer("agent_host_stream", () => start)
        .answer("agent_host_stream_end", () => null);

      const failure = new TauriAgentHostTransport(shell).stream(
        blocked,
        {},
        {
          signal: new AbortController().signal,
        },
      );

      await expect(failure).rejects.toMatchObject({ kind: "answer_invalid" });
      expect(shell.callsOf("agent_host_stream_end")).toHaveLength(1);
    });

    it("doesn't call the shell for a signal that has already aborted", async () => {
      const shell = new FakeShell();

      const start = new TauriAgentHostTransport(shell).stream(
        blocked,
        {},
        {
          signal: AbortSignal.abort(new Error("too late")),
        },
      );

      await expect(start).rejects.toThrow("too late");
      expect(shell.calls).toEqual([]);
    });
  });
});
