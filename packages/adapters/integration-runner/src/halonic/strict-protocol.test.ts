import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  bridgeOptions,
  fakeRunnerProcess,
  HandDrivenRunner,
  testNonce,
} from "../pipes.test-helper.ts";
import { connectRunner, type RunnerConnection } from "./connect-runner.ts";
import { RunnerStoppedError } from "./limits.ts";

/** A started connection with a hand-driven runner behind it. */
async function startedRunner() {
  const fake = fakeRunnerProcess();
  const options = bridgeOptions(fake);
  const runner = new HandDrivenRunner(fake);
  const connecting = connectRunner(options);
  const start = await runner.start();
  const connection = await connecting;
  return { fake, options, runner, start, connection };
}

/** Starts a call and waits until the runner has its `call` frame. */
async function runningCall(runner: HandDrivenRunner, connection: RunnerConnection) {
  const result = connection.callTool("forecast", { city: "Ghent" });
  result.catch(() => undefined);
  const call = await runner.next();
  if (call.type !== "call") throw new Error(`expected a call, got ${call.type}`);
  return { result, call: call.call };
}

verifies("integration-runner.strict-protocol", () => {
  describe("before ready", () => {
    it("starts after a ready with this start's nonce, sending the settings and tools", async () => {
      const { start, connection } = await startedRunner();
      expect(start).toEqual({
        type: "start",
        settings: { baseUrl: "https://api.example.com" },
        tools: ["forecast", "echo"],
      });
      await connection.close();
      expect(await connection.stopped).toEqual({ reason: "closed" });
    });

    it("refuses a ready with an old nonce, and kills the runner (A38)", async () => {
      const fake = fakeRunnerProcess();
      const options = bridgeOptions(fake);
      const runner = new HandDrivenRunner(fake);
      const connecting = connectRunner(options);
      await runner.send({ type: "ready", nonce: "nonce-of-an-earlier-start" });
      await expect(connecting).rejects.toBeInstanceOf(RunnerStoppedError);
      expect(options.blocks).toEqual([{ kind: "protocol", detail: "ready with the wrong nonce" }]);
      expect(fake.kills()).toBe(1);
    });

    it("refuses any other frame before ready (A26)", async () => {
      const fake = fakeRunnerProcess();
      const options = bridgeOptions(fake);
      const runner = new HandDrivenRunner(fake);
      const connecting = connectRunner(options);
      await runner.send({ type: "pong", n: 0 });
      await expect(connecting).rejects.toMatchObject({
        stop: { reason: "protocol", detail: "a frame before ready" },
      });
    });
  });

  describe("after start", () => {
    const outsideTheProtocol: [string, (call: number) => object | string, string][] = [
      ["a second ready (A26)", () => ({ type: "ready", nonce: testNonce }), "a second ready"],
      [
        "an unknown type (A33)",
        () => ({ type: "tokens", name: "access" }),
        "a frame outside the protocol",
      ],
      [
        "an unknown key (A33)",
        (call) => ({ type: "result", call, text: "", extra: 1 }),
        "a frame outside the protocol",
      ],
      [
        "a result with text and an error",
        (call) => ({ type: "result", call, text: "", error: "" }),
        "a frame outside the protocol",
      ],
      ["a line that isn't JSON (A33)", () => "not json\n", "a frame is not valid JSON"],
      [
        "a result for a call never started",
        (call) => ({ type: "result", call: call + 1, text: "" }),
        "a result for a call that isn't running",
      ],
      ["a pong for no ping", () => ({ type: "pong", n: 0 }), "a pong for no ping"],
      [
        "a pull for a body it doesn't own (A33)",
        () => ({ type: "pull", body: 0 }),
        "a pull for a body the runner doesn't own",
      ],
      [
        "a cancel for a body it doesn't own",
        () => ({ type: "cancel-body", body: 0 }),
        "a cancel for a body the runner doesn't own",
      ],
      [
        "an abort for a request never sent",
        () => ({ type: "abort", id: 0 }),
        "an abort for a request never sent",
      ],
      [
        "a request for a call Halonic never started (A33)",
        (call) => fetchFrame({ id: 0, call: call + 1 }),
        "a request for a call Halonic never started",
      ],
    ];

    for (const [what, frame, detail] of outsideTheProtocol) {
      it(`stops the runner on ${what}, and fails the running call`, async () => {
        const { fake, options, runner, connection } = await startedRunner();
        const { result, call } = await runningCall(runner, connection);
        await runner.send(frame(call));
        await expect(result).rejects.toBeInstanceOf(RunnerStoppedError);
        expect(await connection.stopped).toEqual({ reason: "protocol", detail });
        expect(options.blocks).toEqual([{ kind: "protocol", detail }]);
        expect(fake.kills()).toBe(1);
      });
    }

    it("stops the runner on a second result for the same call", async () => {
      const { runner, connection } = await startedRunner();
      const { result, call } = await runningCall(runner, connection);
      await runner.send({ type: "result", call, text: "sunny" });
      expect(await result).toBe("sunny");
      await runner.send({ type: "result", call, text: "sunny again" });
      expect(await connection.stopped).toMatchObject({ reason: "protocol" });
    });

    it("stops the runner on a request number used twice", async () => {
      const { fake, runner, connection } = await startedRunner();
      const { call } = await runningCall(runner, connection);
      await runner.send(fetchFrame({ id: 3, call }));
      await runner.send(fetchFrame({ id: 3, call }));
      expect(await connection.stopped).toEqual({
        reason: "protocol",
        detail: "a request number used twice",
      });
      expect(fake.kills()).toBe(1);
    });

    it("refuses calls once the runner has stopped", async () => {
      const { runner, connection } = await startedRunner();
      await runner.send({ type: "ready", nonce: testNonce });
      await connection.stopped;
      await expect(connection.callTool("forecast", {})).rejects.toMatchObject({
        stop: { reason: "protocol" },
      });
    });

    it("reports a runner that ends by itself, with its exit", async () => {
      const { fake, runner, connection } = await startedRunner();
      const { result } = await runningCall(runner, connection);
      fake.exit(1);
      await expect(result).rejects.toBeInstanceOf(RunnerStoppedError);
      expect(await connection.stopped).toEqual({
        reason: "exited",
        exit: { code: 1, signal: null, reason: "exited" },
      });
    });
  });
});

function fetchFrame(fields: { id: number; call: number }) {
  return {
    type: "fetch",
    ...fields,
    url: "https://api.example.com/v1/forecast",
    method: "GET",
    headers: [],
    body: null,
    auth: [],
  };
}
