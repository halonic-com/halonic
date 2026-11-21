import { PassThrough } from "node:stream";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ControlFrameDecoder, ControlPipeFault, encodeControlFrame } from "./control-frames.ts";
import type { HandshakeMessage } from "./control-messages.ts";
import { ControlPipe, type ControlPipeHandlers } from "./control-pipe.ts";

const handshake: HandshakeMessage = {
  kind: "handshake",
  protocol: 1,
  url: "http://127.0.0.1:41234",
  token: "a".repeat(43),
};

/** A frame as the shell writes it: the length, then the bytes. */
function shellFrame(content: string | Buffer): Buffer {
  const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length, 0);
  return Buffer.concat([length, bytes]);
}

/** A `secret_answer` frame's JSON for request `id`, with the broker answer's own fields. */
function answer(id: number, brokerFields: string): string {
  return `{"kind":"secret_answer","id":${id},${brokerFields}}`;
}

/** A pipe on fake standard input and output, with what its handlers heard. */
function openPipe(overrides: Partial<ControlPipeHandlers> = {}) {
  const input = new PassThrough();
  const output = new PassThrough();
  const heard = {
    sandboxHosts: [] as unknown[],
    stops: 0,
    faults: [] as ControlPipeFault[],
    ends: 0,
  };
  const handlers: ControlPipeHandlers = {
    sandboxHost: (connection) => heard.sandboxHosts.push(connection),
    stop: () => heard.stops++,
    fault: (error) => heard.faults.push(error),
    end: () => heard.ends++,
    ...overrides,
  };
  const pipe = new ControlPipe(input, output, handlers);
  const chunks: Buffer[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk));
  /** The messages written since the last call. */
  const written = async () => {
    await settle();
    return new ControlFrameDecoder().push(Buffer.concat(chunks.splice(0)));
  };
  return { pipe, input, heard, written };
}

/** Lets the stream events that `write` queued run. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

verifies("agent-host.engine-control-pipe", () => {
  describe("what the engine writes", () => {
    it("writes a length, then the message as JSON", () => {
      const frame = encodeControlFrame(handshake);
      expect(frame.readUInt32BE(0)).toBe(frame.length - 4);
      expect(JSON.parse(frame.subarray(4).toString("utf8"))).toEqual(handshake);
    });

    it("refuses a message over the engine's cap", () => {
      const huge = { kind: "secret_get", id: 1, name: "x".repeat(64 * 1024) } as const;
      expect(() => encodeControlFrame(huge)).toThrow(RangeError);
    });

    it("sends the handshake before anything else", async () => {
      const { pipe, written } = openPipe();
      const health = { kind: "health", scheduling: true, activeRuns: 0, lastTick: null } as const;
      expect(() => pipe.send(health)).toThrow(/handshake/);
      pipe.send(handshake);
      pipe.send(health);
      expect(await written()).toEqual([handshake, health]);
    });

    it("numbers requests from 1 and resolves each with its own answer", async () => {
      const { pipe, input, written } = openPipe();
      pipe.send(handshake);
      const secret = pipe.ask("secret_get", "acme_key");
      const origins = pipe.ask("origins_get", "acme_key");
      expect((await written()).slice(1)).toEqual([
        { kind: "secret_get", id: 1, name: "acme_key" },
        { kind: "origins_get", id: 2, name: "acme_key" },
      ]);
      input.write(shellFrame(answer(2, '"result":"origins","origins":["https://acme.example"]')));
      input.write(shellFrame(answer(1, '"result":"value","value":"canary-value"')));
      await expect(secret).resolves.toEqual({ result: "value", value: "canary-value" });
      await expect(origins).resolves.toMatchObject({ origins: ["https://acme.example"] });
    });

    it("answers busy itself while 16 requests are open", async () => {
      const { pipe, written } = openPipe();
      pipe.send(handshake);
      for (let index = 0; index < 16; index++) void pipe.ask("secret_get", `key_${index}`);
      expect(await written()).toHaveLength(17);
      await expect(pipe.ask("secret_get", "one_more")).resolves.toMatchObject({
        result: "refused",
        reason: "busy",
      });
      expect(await written()).toEqual([]);
    });

    it("doesn't count a request whose name is too long for a frame as open", async () => {
      const { pipe, written } = openPipe();
      pipe.send(handshake);
      await expect(pipe.ask("secret_get", "x".repeat(64 * 1024))).rejects.toThrow(RangeError);
      for (let index = 0; index < 16; index++) void pipe.ask("secret_get", `key_${index}`);
      const sent = await written();
      expect(sent).toHaveLength(17);
      expect(sent.at(-1)).toEqual({ kind: "secret_get", id: 17, name: "key_15" });
    });
  });

  describe("what the shell sends", () => {
    it("passes on the sandbox host and stop, in a frame split anywhere", async () => {
      const { input, heard } = openPipe();
      const both = Buffer.concat([
        shellFrame('{"kind":"sandbox_host","connection":{"url":"http://127.0.0.1:5","token":"t"}}'),
        shellFrame('{"kind":"stop"}'),
      ]);
      input.write(both.subarray(0, 3));
      input.write(both.subarray(3, 40));
      input.write(both.subarray(40));
      await settle();
      expect(heard.sandboxHosts).toEqual([{ url: "http://127.0.0.1:5", token: "t" }]);
      expect(heard.stops).toBe(1);
      expect(heard.faults).toEqual([]);
    });

    const faults: [string, Buffer][] = [
      ["a length of 0", Buffer.alloc(4)],
      ["a length over the cap", Buffer.from([0, 2, 0, 1])],
      ["JSON without a length", Buffer.from('{"canary-value"}')],
      ["bad UTF-8", shellFrame(Buffer.from([0x7b, 0xff, 0x7d]))],
      ["bad JSON", shellFrame("{canary-value")],
      ["not an object", shellFrame("[]")],
      ["an unknown kind", shellFrame('{"kind":"secret_set","id":1}')],
      ["an extra field", shellFrame('{"kind":"stop","now":true}')],
      ["an unknown result", shellFrame(answer(1, '"result":"maybe"'))],
      [
        "a field of another result",
        shellFrame(answer(1, '"result":"value","value":null,"reason":"busy"')),
      ],
      ["a wrong type", shellFrame(answer(1, '"result":"value","value":7'))],
      ["an id that isn't a number above 0", shellFrame(answer(0, '"result":"value","value":null'))],
      ["an unknown refusal", shellFrame(answer(1, '"result":"refused","reason":"later"'))],
      ["an answer to no open request", shellFrame(answer(9, '"result":"value","value":null'))],
      ["an answer of the wrong result", shellFrame(answer(1, '"result":"origins","origins":null'))],
    ];

    for (const [name, frame] of faults) {
      it(`stops at ${name}, fails open requests and quotes nothing`, async () => {
        const { pipe, input, heard } = openPipe();
        pipe.send(handshake);
        const open = pipe.ask("secret_get", "acme_key");
        input.write(Buffer.concat([frame, shellFrame('{"kind":"stop"}')]));
        await expect(open).rejects.toBeInstanceOf(ControlPipeFault);
        expect(heard.faults).toHaveLength(1);
        // Neither the content nor the length, which is content on a misaligned stream.
        expect(heard.faults[0]?.message).not.toContain("canary");
        expect(heard.faults[0]?.message).not.toContain(String(frame.readUInt32BE(0)));
        expect(heard.stops).toBe(0);
        expect(input.destroyed).toBe(true);
      });
    }

    it("treats a second answer to one request as a fault", async () => {
      const { pipe, input, heard } = openPipe();
      pipe.send(handshake);
      const open = pipe.ask("token_get", "halonic_token_acme");
      input.write(shellFrame(answer(1, '"result":"value","value":null')));
      input.write(shellFrame(answer(1, '"result":"value","value":null')));
      await expect(open).resolves.toEqual({ result: "value", value: null });
      await settle();
      expect(heard.faults).toHaveLength(1);
    });

    it("stops with a fault that keeps the cause when a handler throws", async () => {
      const failure = new Error("The engine couldn't stop.");
      const { pipe, input, heard } = openPipe({
        stop: () => {
          throw failure;
        },
      });
      pipe.send(handshake);
      const open = pipe.ask("secret_get", "acme_key");
      input.write(shellFrame('{"kind":"stop"}'));
      await expect(open).rejects.toBeInstanceOf(ControlPipeFault);
      expect(heard.faults).toHaveLength(1);
      expect(heard.faults[0]?.message).toMatch(/handler failed/);
      expect(heard.faults[0]?.cause).toBe(failure);
    });

    it("fails open requests and says the shell is gone when input ends", async () => {
      const { pipe, input, heard } = openPipe();
      pipe.send(handshake);
      const open = pipe.ask("secret_get", "acme_key");
      input.end();
      await expect(open).rejects.toThrow(/closed/);
      expect(heard.ends).toBe(1);
      expect(heard.faults).toEqual([]);
      await expect(pipe.ask("secret_get", "acme_key")).rejects.toThrow(/closed/);
    });
  });
});
