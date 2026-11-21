import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { EngineCallRefused, tauriEngineFetch } from "./engine-fetch.ts";
import { FakeShell } from "./fake-shell.test-helper.ts";

const runEvents = "http://engine.invalid/api/runs/r1/events?after=0";

/** A shell whose `engine_stream` opens every stream; `channels` holds each one's argument. */
function streamingShell(): { shell: FakeShell; channels: string[] } {
  const channels: string[] = [];
  const shell = new FakeShell()
    .answer("engine_stream", (args) => {
      channels.push(String(args["channel"]));
      return { stream: args["stream"] };
    })
    .answer("engine_stream_end", () => null);
  return { shell, channels };
}

/** Sends the stream messages `messages` on `channel`, numbered from 0. */
function sendAll(shell: FakeShell, channel: string, messages: unknown[]): void {
  for (const [index, message] of messages.entries()) {
    shell.send(channel, { index, message });
  }
}

/** Waits for the stream's start to reach the shell, so its channel is known. */
async function opened(channels: string[]): Promise<string> {
  await vi.waitFor(() => expect(channels).toHaveLength(1));
  return channels[0] as string;
}

verifies("services.engine-fetch", () => {
  describe("a JSON route", () => {
    it("sends the route's name, params and body, and answers with the engine's status and body", async () => {
      const shell = new FakeShell().answer("engine_request", () => ({
        status: 201,
        body: { id: "r1" },
      }));

      const response = await tauriEngineFetch(shell)(
        new Request("http://engine.invalid/api/runs/run%2001/events", {
          method: "POST",
          body: JSON.stringify({ event: "approve" }),
        }),
      );

      expect(shell.callsOf("engine_request")).toEqual([
        {
          route: "POST /api/runs/{run}/events",
          params: { run: "run 01" },
          body: { event: "approve" },
        },
      ]);
      expect(response.status).toBe(201);
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(await response.json()).toEqual({ id: "r1" });
    });

    it("sends no body for a GET, and gives an empty answer as an empty body", async () => {
      const shell = new FakeShell().answer("engine_request", () => ({ status: 204, body: null }));

      const response = await tauriEngineFetch(shell)(
        new Request("http://engine.invalid/api/waiting-runs"),
      );

      expect(shell.callsOf("engine_request")[0]?.["body"]).toBeUndefined();
      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
    });

    it("refuses another address or route without calling the shell", async () => {
      const shell = new FakeShell();
      const fetch = tauriEngineFetch(shell);

      await expect(fetch(new Request("https://example.com/api/runs"))).rejects.toMatchObject({
        name: "EngineCallRefused",
        kind: "unknown_route",
      });
      await expect(fetch(new Request("http://engine.invalid/api/login"))).rejects.toMatchObject({
        kind: "unknown_route",
      });
      expect(shell.calls).toEqual([]);
    });

    it("fails with the shell's refusal kind, such as engine_unavailable", async () => {
      const shell = new FakeShell().answer("engine_request", () => {
        throw { kind: "engine_unavailable", message: "no engine runs for this window's workspace" };
      });

      const refusal = await tauriEngineFetch(shell)(
        new Request("http://engine.invalid/api/hello"),
      ).catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(EngineCallRefused);
      expect(refusal).toMatchObject({
        kind: "engine_unavailable",
        message: "The shell refused the engine call: no engine runs for this window's workspace.",
      });
    });

    it("names the kind when the refusal has no message, and passes on what isn't a refusal", async () => {
      const shell = new FakeShell().answer("engine_request", () => {
        throw { kind: "io" };
      });
      const fetch = tauriEngineFetch(shell);
      await expect(fetch(new Request("http://engine.invalid/api/hello"))).rejects.toMatchObject({
        kind: "io",
        message: "The shell refused the engine call: io.",
      });

      const bare = new FakeShell();
      await expect(
        tauriEngineFetch(bare)(new Request("http://engine.invalid/api/hello")),
      ).rejects.toBe("command engine_request not allowed");
    });

    it("refuses an answer that isn't the engine's status and body", async () => {
      const shell = new FakeShell().answer("engine_request", () => ({ status: "200" }));

      await expect(
        tauriEngineFetch(shell)(new Request("http://engine.invalid/api/hello")),
      ).rejects.toMatchObject({ kind: "answer_invalid" });
    });

    it("stops waiting when the request is aborted", async () => {
      // Waits on the shell call itself rather than polling, so a loaded machine can't time it out.
      let called: () => void = () => {};
      const shellCalled = new Promise<void>((resolve) => (called = resolve));
      const shell = new FakeShell().answer("engine_request", () => {
        called();
        return new Promise(() => {});
      });
      const controller = new AbortController();
      const reason = new Error("left the page");

      const answer = tauriEngineFetch(shell)(
        new Request("http://engine.invalid/api/hello", { signal: controller.signal }),
      );
      await shellCalled;
      controller.abort(reason);

      await expect(answer).rejects.toBe(reason);
      await expect(
        tauriEngineFetch(shell)(
          new Request("http://engine.invalid/api/hello", { signal: controller.signal }),
        ),
      ).rejects.toBe(reason);
    });
  });

  describe("a stream route", () => {
    it("reads the events as server-sent events until end, and leaves no callback behind", async () => {
      const { shell, channels } = streamingShell();

      const response = await tauriEngineFetch(shell)(new Request(runEvents));
      const channel = await opened(channels);
      sendAll(shell, channel, [
        { type: "event", id: "3", event: "run", data: '{"seq":3}' },
        { type: "event", event: "note", data: "two\nlines" },
        { type: "end" },
      ]);

      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
      expect(await response.text()).toBe(
        'id: 3\nevent: run\ndata: {"seq":3}\n\nevent: note\ndata: two\ndata: lines\n\n',
      );
      expect(shell.callsOf("engine_stream")[0]).toMatchObject({
        route: "GET /api/runs/{run}/events",
        params: { run: "r1", after: 0 },
        channel,
      });
      expect(shell.registered(channel)).toBe(false);
      expect(shell.callsOf("engine_stream_end")).toEqual([]);
    });

    it("gives each stream its own id", async () => {
      const { shell } = streamingShell();
      const fetch = tauriEngineFetch(shell);

      await fetch(new Request(runEvents));
      await fetch(new Request("http://engine.invalid/api/run-updates"));

      const [first, second] = shell.callsOf("engine_stream");
      expect(first?.["stream"]).not.toBe(second?.["stream"]);
    });

    it("fails the body when the shell says the stream broke off", async () => {
      const { shell, channels } = streamingShell();

      const response = await tauriEngineFetch(shell)(new Request(runEvents));
      sendAll(shell, await opened(channels), [{ type: "failed", message: "connection reset" }]);

      await expect(response.text()).rejects.toThrow(
        "The engine's stream broke off: connection reset.",
      );
    });

    it("ends the body and the shell's stream when the request is aborted", async () => {
      const { shell, channels } = streamingShell();
      const controller = new AbortController();
      const reason = new Error("closed");

      const response = await tauriEngineFetch(shell)(
        new Request(runEvents, { signal: controller.signal }),
      );
      const channel = await opened(channels);
      controller.abort(reason);

      await expect(response.text()).rejects.toBe(reason);
      const id = shell.callsOf("engine_stream")[0]?.["stream"];
      expect(shell.callsOf("engine_stream_end")).toEqual([{ stream: id }]);
      expect(shell.registered(channel)).toBe(false);
    });

    it("hangs up when the request is aborted while the shell opens the stream", async () => {
      let opening: (start: unknown) => void = () => {};
      const shell = new FakeShell()
        .answer("engine_stream", () => new Promise((resolve) => (opening = resolve)))
        .answer("engine_stream_end", () => null);
      const controller = new AbortController();
      const reason = new Error("closed");

      const response = tauriEngineFetch(shell)(
        new Request(runEvents, { signal: controller.signal }),
      );
      await vi.waitFor(() => expect(shell.callsOf("engine_stream")).toHaveLength(1));
      controller.abort(reason);
      opening({ stream: shell.callsOf("engine_stream")[0]?.["stream"] });

      await expect(response).rejects.toBe(reason);
      expect(shell.callsOf("engine_stream_end")).toHaveLength(1);
    });

    it("tells the shell nothing when the request is aborted after the stream ended", async () => {
      const { shell, channels } = streamingShell();
      const controller = new AbortController();

      const response = await tauriEngineFetch(shell)(
        new Request(runEvents, { signal: controller.signal }),
      );
      sendAll(shell, await opened(channels), [{ type: "end" }]);
      expect(await response.text()).toBe("");
      controller.abort();

      expect(shell.callsOf("engine_stream_end")).toEqual([]);
    });

    it("ends the shell's stream when the reader cancels the body", async () => {
      const { shell, channels } = streamingShell();

      const response = await tauriEngineFetch(shell)(new Request(runEvents));
      const channel = await opened(channels);
      await response.body?.cancel();
      sendAll(shell, channel, [{ type: "end" }]);

      expect(shell.callsOf("engine_stream_end")).toHaveLength(1);
      expect(shell.registered(channel)).toBe(false);
    });

    it("hangs up on a message that isn't a stream message", async () => {
      for (const message of ["text", { type: "line" }]) {
        const { shell, channels } = streamingShell();
        const response = await tauriEngineFetch(shell)(new Request(runEvents));
        sendAll(shell, await opened(channels), [message]);

        await expect(response.text()).rejects.toMatchObject({ kind: "answer_invalid" });
        expect(shell.callsOf("engine_stream_end")).toHaveLength(1);
      }
    });

    it("answers with the engine's refusal when it didn't open the stream", async () => {
      const shell = new FakeShell().answer("engine_stream", () => ({
        answer: { status: 404, body: { code: "run_not_found", message: "There is no such run." } },
      }));

      const response = await tauriEngineFetch(shell)(new Request(runEvents));

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "run_not_found" });
      expect(shell.callsOf("engine_stream_end")).toEqual([]);
    });

    it("fails with the shell's refusal, which opened nothing", async () => {
      const shell = new FakeShell().answer("engine_stream", () => {
        throw { kind: "too_many_streams", message: "a page may have 16 engine streams open" };
      });

      await expect(tauriEngineFetch(shell)(new Request(runEvents))).rejects.toMatchObject({
        kind: "too_many_streams",
      });
      expect(shell.callsOf("engine_stream_end")).toEqual([]);
    });

    it("hangs up when the shell's start isn't this stream", async () => {
      const shell = new FakeShell()
        .answer("engine_stream", () => ({ stream: -1 }))
        .answer("engine_stream_end", () => null);

      await expect(tauriEngineFetch(shell)(new Request(runEvents))).rejects.toMatchObject({
        kind: "answer_invalid",
      });
      expect(shell.callsOf("engine_stream_end")).toHaveLength(1);
    });

    it("logs a failed engine_stream_end and carries on", async () => {
      const shell = new FakeShell().answer("engine_stream", () => ({ stream: -1 }));
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(tauriEngineFetch(shell)(new Request(runEvents))).rejects.toMatchObject({
        kind: "answer_invalid",
      });

      await vi.waitFor(() =>
        expect(error).toHaveBeenCalledWith(
          "Couldn't tell the shell an engine stream ended.",
          "command engine_stream_end not allowed",
        ),
      );
      error.mockRestore();
    });
  });
});
