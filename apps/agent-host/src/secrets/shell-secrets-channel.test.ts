import { PassThrough } from "node:stream";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { encodeFrame, FrameDecoder, FrameKind, FrameStreamError } from "../stdio/frame-codec.ts";
import { carryHostConnection } from "../stdio/frame-stream.ts";
import type { FrameSink } from "../stdio/framed-connection.ts";
import { takeStandardOutput } from "../stdio/standard-output.ts";
import { ShellSecretsChannel } from "./shell-secrets-channel.ts";

/** A channel whose sent frames the test reads back as requests. */
function openChannel() {
  const channel = new ShellSecretsChannel();
  const sent: unknown[] = [];
  const sink: FrameSink = {
    send(frame, done) {
      const [decoded] = new FrameDecoder().push(frame);
      expect(decoded?.connection).toBe(0);
      sent.push(JSON.parse(decoded?.bytes.toString("utf8") ?? ""));
      done?.();
    },
  };
  return { channel, sent, open: () => channel.open(sink) };
}

const answer = (value: unknown) => ({
  connection: 0,
  kind: FrameKind.data,
  bytes: Buffer.from(JSON.stringify(value)),
});

/** Lets queued promise callbacks run. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

verifies("agent-host.keychain-secrets", () => {
  describe("ShellSecretsChannel", () => {
    it("sends a request only once the stream runs, and the next only after the answer", async () => {
      const { channel, sent, open } = openChannel();
      const first = channel.ask({ op: "get", name: "remote_host_key" });
      const second = channel.ask({ op: "delete", name: "remote_host_key" });
      await settle();
      expect(sent).toEqual([]);

      open();
      await settle();
      expect(sent).toEqual([{ op: "get", name: "remote_host_key" }]);
      channel.receive(answer({ ok: true, value: "made-up-value" }));
      expect(await first).toEqual({ ok: true, value: "made-up-value" });

      await settle();
      expect(sent).toHaveLength(2);
      channel.receive(answer({ ok: false, kind: "unavailable", message: "No keychain." }));
      expect(await second).toEqual({ ok: false, kind: "unavailable", message: "No keychain." });
    });

    it("breaks the stream on an answer nobody asked for", () => {
      const { channel, open } = openChannel();
      open();
      expect(() => channel.receive(answer({ ok: true, value: null }))).toThrow(FrameStreamError);
    });

    it.each([
      ["not JSON", Buffer.from("{")],
      ["an extra field", Buffer.from(JSON.stringify({ ok: true, value: null, more: 1 }))],
      ["a value that isn't text", Buffer.from(JSON.stringify({ ok: true, value: 7 }))],
      ["a failure without its kind", Buffer.from(JSON.stringify({ ok: false, message: "x" }))],
    ])("breaks the stream on an answer that is %s, without repeating it", async (_what, bytes) => {
      const { channel, open } = openChannel();
      open();
      void channel.ask({ op: "get", name: "remote_host_key" }).catch(() => undefined);
      await settle();
      expect(() => channel.receive({ connection: 0, kind: FrameKind.data, bytes })).toThrow(
        /^The shell's answer on the secrets channel isn't/,
      );
    });

    it("breaks the stream on a frame on id 0 that isn't data", async () => {
      const { channel, open } = openChannel();
      open();
      void channel.ask({ op: "get", name: "remote_host_key" }).catch(() => undefined);
      await settle();
      expect(() =>
        channel.receive({ connection: 0, kind: FrameKind.end, bytes: Buffer.alloc(0) }),
      ).toThrow(FrameStreamError);
    });

    it("fails the waiting request and every later one once the stream ends", async () => {
      const { channel, open } = openChannel();
      open();
      const waiting = channel.ask({ op: "get", name: "remote_host_key" });
      await settle();
      channel.close(new Error("The input ended."));
      await expect(waiting).rejects.toThrow(
        "The secrets channel to Studio closed: The input ended.",
      );
      await expect(channel.ask({ op: "get", name: "remote_host_key" })).rejects.toThrow(
        /closed: The input ended/,
      );
    });

    it("fails a request that doesn't fit one frame, without its value", async () => {
      const { channel, open } = openChannel();
      open();
      const value = "v".repeat(70_000);
      const asked = channel.ask({ op: "set", name: "remote_host_key", value });
      await expect(asked).rejects.toThrow(RangeError);
      await expect(asked).rejects.not.toThrow(value);
    });

    it("keeps its frames whole on standard output when something else prints there after the handshake", async () => {
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const input = new PassThrough();
      const chunks: Buffer[] = [];
      stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      stdout.write("handshake\n");
      const output = takeStandardOutput(stdout, stderr);
      const channel = new ShellSecretsChannel();
      const ended = carryHostConnection({ input, output }, channel);

      const asked = channel.ask({ op: "get", name: "remote_host_key" });
      // A stray print, as a library's console.log would make.
      stdout.write("a stray log line\n");
      while (chunks.length < 2) await settle();

      const written = Buffer.concat(chunks);
      expect(written.subarray(0, 10).toString()).toBe("handshake\n");
      const frames = new FrameDecoder().push(written.subarray(10));
      expect(frames.map((frame) => [frame.connection, frame.bytes.toString()])).toEqual([
        [0, JSON.stringify({ op: "get", name: "remote_host_key" })],
      ]);
      expect((stderr.read() as Buffer).toString()).toBe("a stray log line\n");

      input.write(encodeFrame(0, FrameKind.data, Buffer.from('{"ok":true,"value":null}')));
      expect(await asked).toEqual({ ok: true, value: null });
      input.end();
      expect(await ended).toBeUndefined();
    });

    it("stops serving on loopback when a frame arrives for any id but the host's own", async () => {
      const input = new PassThrough();
      const channel = new ShellSecretsChannel();
      const ended = carryHostConnection({ input, output: new PassThrough() }, channel);
      input.write(encodeFrame(1, FrameKind.open));
      expect(await ended).toMatchObject({ message: "Connection 1 was never opened." });
    });
  });
});
