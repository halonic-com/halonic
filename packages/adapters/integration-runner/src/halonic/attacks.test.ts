// A hostile runner against Halonic's side of the bridge: malformed, oversize
// and out-of-order frames (design HAL-958, attack cases A21, A26, A33, A37,
// A38; proposal on HAL-4338). Each case must stop the runner with exactly one
// block, or be answered without stopping it, and never throw inside Halonic.

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FrameTooLargeError } from "../frame-lines.ts";
import { type HalonicFrame, maxFrameBytes } from "../frames.ts";
import {
  bridgeOptions,
  fakeKitClient,
  fakeRunnerProcess,
  HandDrivenRunner,
  testNonce,
} from "../pipes.test-helper.ts";
import {
  type ConnectRunnerOptions,
  connectRunner,
  type RunnerConnection,
} from "./connect-runner.ts";

const encoder = new TextEncoder();

async function startedRunner(overrides: Partial<ConnectRunnerOptions> = {}) {
  const fake = fakeRunnerProcess();
  const options = bridgeOptions(fake, overrides);
  const runner = new HandDrivenRunner(fake);
  const connecting = connectRunner(options);
  await runner.start();
  const connection = await connecting;
  return { fake, options, runner, connection };
}

async function runningCall(
  runner: HandDrivenRunner,
  connection: RunnerConnection,
  signal?: AbortSignal,
) {
  const result = connection.callTool("forecast", {}, signal);
  result.catch(() => undefined);
  const call = await runner.next();
  if (call.type !== "call") throw new Error(`expected a call, got ${call.type}`);
  return { result, call: call.call };
}

/** A runner that never answers its `ready` correctly: returns the stop it gets. */
async function stopBeforeStart(ready: object | string) {
  const fake = fakeRunnerProcess();
  const options = bridgeOptions(fake);
  const connecting = connectRunner(options);
  connecting.catch(() => undefined);
  await new HandDrivenRunner(fake).send(ready);
  await expect(connecting).rejects.toMatchObject({ stop: { reason: "protocol" } });
  return options.blocks;
}

function fetchFrame(id: number, call: number, extra: object = {}) {
  return {
    type: "fetch",
    id,
    call,
    url: "https://api.example.com/v1/forecast",
    method: "GET",
    headers: [],
    body: null,
    auth: [],
    ...extra,
  };
}

/** A `result` line padded with text to exactly `bytes` bytes, newline included. */
function resultLine(call: number, bytes: number, last = "a") {
  const empty = `${JSON.stringify({ type: "result", call, text: "" })}\n`;
  const pad = bytes - encoder.encode(empty).byteLength - encoder.encode(last).byteLength;
  return `${JSON.stringify({ type: "result", call, text: "a".repeat(pad) + last })}\n`;
}

/** Bytes of `before`, then raw `bad` bytes, then `after`. */
function withRawBytes(before: string, bad: number[], after: string): Uint8Array[] {
  return [new Uint8Array([...encoder.encode(before), ...bad]), encoder.encode(after)];
}

afterEach(() => {
  vi.useRealTimers();
});

verifies("integration-runner.strict-protocol", () => {
  describe("malformed frames (A33)", () => {
    // Only Halonic's one parser reads these frames, so these leniencies can't
    // make two readers disagree. They are pinned so a change is a decision.
    it("accepts a byte-order mark, a CRLF line end and a repeated key, and the last key wins", async () => {
      const fake = fakeRunnerProcess();
      const options = bridgeOptions(fake);
      const runner = new HandDrivenRunner(fake);
      const connecting = connectRunner(options);
      await runner.send(`\uFEFF{"type":"ready","nonce":"wrong","nonce":"${testNonce}"}\r\n`);
      const connection = await connecting;
      expect(await runner.next()).toMatchObject({ type: "start" });
      await connection.close();
      expect(options.blocks).toEqual([]);
    });

    const refused: [string, number[], string][] = [
      ["a UTF-16 surrogate encoded as UTF-8", [0xed, 0xa0, 0x80], "a frame is not valid UTF-8"],
      ["an overlong UTF-8 slash", [0xc0, 0xaf], "a frame is not valid UTF-8"],
      ["a raw NUL inside a string", [0x00], "a frame is not valid JSON"],
      ["a raw ESC control byte inside a string", [0x1b], "a frame is not valid JSON"],
    ];
    for (const [what, bad, detail] of refused) {
      it(`stops the runner on ${what}, split across two pieces`, async () => {
        const { options, runner, connection } = await startedRunner();
        for (const piece of withRawBytes('{"type":"pong","n":0,"x":"', bad, '"}\n')) {
          await runner.sendBytes(piece);
        }
        expect(await connection.stopped).toEqual({ reason: "protocol", detail });
        expect(options.blocks).toHaveLength(1);
      });
    }

    for (const line of ["\n", "   \n", `${"[".repeat(200_000)}${"]".repeat(200_000)}\n`]) {
      it(`stops the runner on a line of ${line.length} bytes that isn't a frame`, async () => {
        const { runner, connection } = await startedRunner();
        await runner.send(line);
        expect(await connection.stopped).toMatchObject({ reason: "protocol" });
      });
    }

    it("refuses __proto__ and constructor keys and leaves Object's prototype alone", async () => {
      for (const key of ["__proto__", "constructor"]) {
        const { runner, connection } = await startedRunner();
        await runner.send(`{"type":"pong","n":0,"${key}":{"polluted":true}}\n`);
        expect(await connection.stopped).toEqual({
          reason: "protocol",
          detail: "a frame outside the protocol",
        });
      }
      expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    });

    const badIds: [string, string][] = [
      ["1e400", "1e400"],
      ["1.5", "1.5"],
      ["2^53", String(2 ** 53)],
      ['"0"', '"0"'],
      ["null", "null"],
      ["-1", "-1"],
    ];
    for (const [what, id] of badIds) {
      it(`refuses ${what} as a number in a frame`, async () => {
        const { runner, connection } = await startedRunner();
        await runner.send(`{"type":"abort","id":${id}}\n`);
        expect(await connection.stopped).toEqual({
          reason: "protocol",
          detail: "a frame outside the protocol",
        });
      });
    }

    it("takes -0 as call 0", async () => {
      const { runner, connection } = await startedRunner();
      const { result } = await runningCall(runner, connection);
      await runner.send('{"type":"result","call":-0,"text":"sunny"}\n');
      expect(await result).toBe("sunny");
      await connection.close();
    });

    it("carries a lone surrogate in a result without throwing", async () => {
      const { runner, connection } = await startedRunner();
      const { result } = await runningCall(runner, connection);
      await runner.send('{"type":"result","call":0,"text":"\\ud800"}\n');
      expect(await result).toBe("\ud800");
      await connection.close();
    });

    // One case per frame type, so a new type can't skip the strict shapes.
    const withExtraKey: [string, (call: number) => object][] = [
      ["ready", () => ({ type: "ready", nonce: testNonce })],
      ["pong", () => ({ type: "pong", n: 0 })],
      ["result", (call) => ({ type: "result", call, text: "" })],
      ["fetch", (call) => fetchFrame(0, call)],
      [
        "fetch auth",
        (call) => fetchFrame(0, call, { auth: [{ secret: "key", as: "bearer", x: 1 }] }),
      ],
      ["fetch body", (call) => fetchFrame(0, call, { body: { kind: "text", text: "", x: 1 } })],
      ["pull", () => ({ type: "pull", body: 0 })],
      ["cancel-body", () => ({ type: "cancel-body", body: 0 })],
      ["abort", () => ({ type: "abort", id: 0 })],
    ];
    for (const [type, frame] of withExtraKey) {
      it(`refuses an unknown key on ${type}`, async () => {
        const { runner, connection } = await startedRunner();
        const { call } = await runningCall(runner, connection);
        await runner.send({ x: 1, ...frame(call) });
        expect(await connection.stopped).toEqual({
          reason: "protocol",
          detail: "a frame outside the protocol",
        });
      });
    }
  });

  describe("oversize (A21)", () => {
    it("takes a line of exactly 1 MiB with its newline", async () => {
      const { runner, connection } = await startedRunner();
      const { result } = await runningCall(runner, connection);
      const line = resultLine(0, maxFrameBytes);
      await runner.send(line);
      expect(encoder.encode(line).byteLength).toBe(maxFrameBytes);
      expect(await result).toMatch(/^a+$/);
      await connection.close();
    });

    it("stops the runner on a line one byte longer, a 3-byte character split across the limit", async () => {
      const { options, runner, connection } = await startedRunner();
      await runningCall(runner, connection);
      const line = encoder.encode(resultLine(0, maxFrameBytes + 1, "€"));
      const cut = line.byteLength - 3;
      await runner.sendBytes(line.subarray(0, cut));
      await runner.sendBytes(line.subarray(cut));
      expect(await connection.stopped).toEqual({
        reason: "protocol",
        detail: `a frame is longer than ${maxFrameBytes} bytes`,
      });
      expect(options.blocks).toHaveLength(1);
    });

    it("refuses tool arguments too large to send, and keeps the runner", async () => {
      const { runner, connection } = await startedRunner();
      await expect(
        connection.callTool("forecast", { city: "a".repeat(maxFrameBytes) }),
      ).rejects.toBeInstanceOf(FrameTooLargeError);
      const { result, call } = await runningCall(runner, connection);
      await runner.send({ type: "result", call, text: "sunny" });
      expect(await result).toBe("sunny");
      await connection.close();
    });

    it("answers response headers too large for a head with response-too-large", async () => {
      const big = new Response("", { headers: { "x-big": "a".repeat(maxFrameBytes) } });
      const { runner, connection } = await startedRunner({ http: fakeKitClient(() => big) });
      const { call } = await runningCall(runner, connection);
      await runner.send(fetchFrame(0, call));
      expect(await runner.next()).toMatchObject({
        type: "error",
        id: 0,
        code: "response-too-large",
      });
      await connection.close();
    });
  });

  describe("out of order (A26, A33, A37, A38)", () => {
    const wrongNonces: [string, string][] = [
      ["another case", testNonce.toUpperCase()],
      ["a prefix", testNonce.slice(0, -1)],
      ["a suffix", `${testNonce}x`],
      ["whitespace", ` ${testNonce}`],
    ];
    for (const [what, nonce] of wrongNonces) {
      it(`refuses a ready whose nonce has ${what} (A38)`, async () => {
        expect(await stopBeforeStart({ type: "ready", nonce })).toEqual([
          { kind: "protocol", detail: "ready with the wrong nonce" },
        ]);
      });
    }

    it("refuses a ready whose nonce is a number", async () => {
      expect(await stopBeforeStart({ type: "ready", nonce: 1 })).toEqual([
        { kind: "protocol", detail: "a frame outside the protocol" },
      ]);
    });

    for (const [what, pongs] of [
      ["a pong guessed ahead", [1]],
      ["the same pong twice", [0, 0]],
    ] as const) {
      it(`stops the runner on ${what}`, async () => {
        vi.useFakeTimers({
          toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
        });
        const { runner, connection } = await startedRunner();
        await vi.advanceTimersByTimeAsync(5_000);
        expect(await runner.next()).toEqual({ type: "ping", n: 0 });
        for (const n of pongs) await runner.send({ type: "pong", n });
        await vi.advanceTimersByTimeAsync(0);
        expect(await connection.stopped).toEqual({
          reason: "protocol",
          detail: "a pong for no ping",
        });
      });
    }

    it("takes the first answer of a cancelled call and stops the runner on a second", async () => {
      const { runner, connection } = await startedRunner();
      const abort = new AbortController();
      const { result, call } = await runningCall(runner, connection, abort.signal);
      abort.abort();
      await expect(result).rejects.toBeDefined();
      expect(await runner.next()).toEqual({ type: "cancel", call });
      await runner.send({ type: "result", call, text: "late" });
      await runner.send({ type: "result", call, text: "later" });
      expect(await connection.stopped).toEqual({
        reason: "protocol",
        detail: "a result for a call that isn't running",
      });
    });

    it("stops the runner on a request number lower than the last", async () => {
      const kit = fakeKitClient(() => new Response(null));
      const { runner, connection } = await startedRunner({ http: kit });
      const { call } = await runningCall(runner, connection);
      await runner.send(fetchFrame(5, call));
      expect(await runner.next()).toMatchObject({ type: "head", id: 5 });
      await runner.send(fetchFrame(4, call));
      expect(await connection.stopped).toEqual({
        reason: "protocol",
        detail: "a request number used twice",
      });
    });

    it("stops the runner on a request number past the largest safe integer", async () => {
      const { runner, connection } = await startedRunner();
      const { call } = await runningCall(runner, connection);
      await runner.send(fetchFrame(Number.MAX_SAFE_INTEGER, call));
      await runner.send(
        `${JSON.stringify(fetchFrame(0, call)).replace('"id":0', `"id":${2 ** 53}`)}\n`,
      );
      expect(await connection.stopped).toEqual({
        reason: "protocol",
        detail: "a frame outside the protocol",
      });
    });

    it("answers a request for a cancelled call with call-not-running, without the kit", async () => {
      const kit = fakeKitClient(() => new Response("{}"));
      const { runner, connection } = await startedRunner({ http: kit });
      const abort = new AbortController();
      const { call } = await runningCall(runner, connection, abort.signal);
      abort.abort();
      expect(await runner.next()).toEqual({ type: "cancel", call });
      await runner.send(fetchFrame(0, call));
      expect(await runner.next()).toMatchObject({ type: "error", id: 0, code: "call-not-running" });
      expect(kit.sent).toEqual([]);
      await connection.close();
    });

    it("stops the runner on a pull before the head", async () => {
      const kit = fakeKitClient(() => new Promise<Response>(() => undefined));
      const { runner, connection } = await startedRunner({ http: kit });
      const { call } = await runningCall(runner, connection);
      await runner.send(fetchFrame(0, call));
      await runner.send({ type: "pull", body: 0 });
      expect(await connection.stopped).toEqual({
        reason: "protocol",
        detail: "a pull for a body the runner doesn't own",
      });
    });

    it("stops the runner on a second pull before the first is answered", async () => {
      const stalled = new Response(
        new ReadableStream({ pull: () => new Promise(() => undefined) }),
      );
      const { runner, connection } = await startedRunner({ http: fakeKitClient(() => stalled) });
      const { call } = await runningCall(runner, connection);
      await runner.send(fetchFrame(0, call));
      expect(await runner.next()).toMatchObject({ type: "head", hasBody: true });
      await runner.send({ type: "pull", body: 0 });
      await runner.send({ type: "pull", body: 0 });
      expect(await connection.stopped).toEqual({
        reason: "protocol",
        detail: "a second pull before the first was answered",
      });
    });

    const afterEnd: [string, object, string][] = [
      ["a pull", { type: "pull", body: 0 }, "a pull for a body the runner doesn't own"],
      ["a cancel", { type: "cancel-body", body: 0 }, "a cancel for a body the runner doesn't own"],
      [
        "an abort for a later request",
        { type: "abort", id: 1 },
        "an abort for a request never sent",
      ],
    ];
    for (const [what, frame, detail] of afterEnd) {
      it(`stops the runner on ${what} after the body's end`, async () => {
        const { runner, connection } = await startedRunner({
          http: fakeKitClient(() => new Response("ok")),
        });
        const { call } = await runningCall(runner, connection);
        await bodyRead(runner, call);
        await runner.send(frame);
        expect(await connection.stopped).toEqual({ reason: "protocol", detail });
      });
    }

    it("ignores an abort after the body's end, as it crossed the end on the way", async () => {
      const { options, runner, connection } = await startedRunner({
        http: fakeKitClient(() => new Response("ok")),
      });
      const { result, call } = await runningCall(runner, connection);
      await bodyRead(runner, call);
      await runner.send({ type: "abort", id: 0 });
      await runner.send({ type: "result", call, text: "sunny" });
      expect(await result).toBe("sunny");
      expect(options.blocks).toEqual([]);
      await connection.close();
    });

    it("ignores frames after the stop and reports exactly one block", async () => {
      const { options, runner, connection } = await startedRunner();
      const { call } = await runningCall(runner, connection);
      await runner.send(
        `not json\n${JSON.stringify({ type: "result", call, text: "" })}\n{"type":"pong","n":9}\nnot json\n`,
      );
      expect(await connection.stopped).toEqual({
        reason: "protocol",
        detail: "a frame is not valid JSON",
      });
      expect(options.blocks).toHaveLength(1);
    });
  });
});

/** Sends request 0 and reads its body to the end. */
async function bodyRead(runner: HandDrivenRunner, call: number): Promise<HalonicFrame[]> {
  await runner.send(fetchFrame(0, call));
  const frames = [await runner.next()];
  await runner.send({ type: "pull", body: 0 });
  frames.push(await runner.next());
  await runner.send({ type: "pull", body: 0 });
  frames.push(await runner.next());
  expect(frames.map((frame) => frame.type)).toEqual(["head", "chunk", "end"]);
  return frames;
}
