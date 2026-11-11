// A request belongs to its tool call: when the call answers, is cancelled or
// fails, Halonic closes its requests, so no network work outlives the call
// (A37). Found by the security read on HAL-4353; the attack tests on
// HAL-4338 play the same cases against the built runner.

import type { IntegrationRequestInit } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  bridgeOptions,
  fakeKitClient,
  fakeRunnerProcess,
  HandDrivenRunner,
} from "../pipes.test-helper.ts";
import { connectRunner, type RunnerConnection } from "./connect-runner.ts";

/** A started connection whose kit answers every request with a body nobody has read yet. */
async function startedRunner() {
  const fake = fakeRunnerProcess();
  const kitSignals: AbortSignal[] = [];
  const http = fakeKitClient((_url, init: IntegrationRequestInit) => {
    if (init.signal) kitSignals.push(init.signal);
    return new Response("a body the runner may read");
  });
  const options = bridgeOptions(fake, { http, limits: { pingIntervalMs: 60_000 } });
  const runner = new HandDrivenRunner(fake);
  const connecting = connectRunner(options);
  await runner.start();
  const connection = await connecting;
  return { options, runner, connection, http, kitSignals };
}

/** Starts a call and waits until the runner has its `call` frame. */
async function runningCall(runner: HandDrivenRunner, connection: RunnerConnection) {
  const abort = new AbortController();
  const result = connection.callTool("forecast", {}, abort.signal);
  result.catch(() => undefined);
  const frame = await runner.next();
  if (frame.type !== "call") throw new Error(`expected a call, got ${frame.type}`);
  return { result, call: frame.call, abort };
}

function fetchFrame(id: number, call: number) {
  return {
    type: "fetch",
    id,
    call,
    url: "https://api.example.com/v1/forecast",
    method: "GET",
    headers: [],
    body: null,
    auth: [],
  };
}

verifies("integration-runner.requests", () => {
  describe("a call's requests close when the call ends (A37)", () => {
    it("closes an open body when the call answers, and tells the runner", async () => {
      const { options, runner, connection, kitSignals } = await startedRunner();
      const { result, call } = await runningCall(runner, connection);
      await runner.send(fetchFrame(0, call));
      expect(await runner.next()).toMatchObject({ type: "head", id: 0, hasBody: true });

      await runner.send({ type: "result", call, text: "sunny" });
      expect(await result).toBe("sunny");
      expect(await runner.next()).toMatchObject({
        type: "error",
        id: 0,
        code: "call-not-running",
      });
      expect(kitSignals[0]?.aborted).toBe(true);

      // A pull after the call ended gets nothing, and the runner keeps running.
      await runner.send({ type: "pull", body: 0 });
      await runner.send({ type: "cancel-body", body: 0 });
      await runner.send({ type: "abort", id: 0 });
      expect(options.blocks).toEqual([]);
      await connection.close();
      expect(await connection.stopped).toEqual({ reason: "closed" });
    });

    it("aborts the kit's request when the call is cancelled, and sends no head", async () => {
      let answer: (response: Response) => void = () => undefined;
      const fake = fakeRunnerProcess();
      const kitSignals: AbortSignal[] = [];
      const http = fakeKitClient((_url, init) => {
        if (init.signal) kitSignals.push(init.signal);
        return new Promise<Response>((resolve) => {
          answer = resolve;
        });
      });
      const options = bridgeOptions(fake, { http });
      const runner = new HandDrivenRunner(fake);
      const connecting = connectRunner(options);
      await runner.start();
      const connection = await connecting;
      const { result, call, abort } = await runningCall(runner, connection);
      await runner.send(fetchFrame(0, call));
      await expect.poll(() => kitSignals.length).toBe(1);

      abort.abort(new DOMException("the user cancelled", "AbortError"));
      await expect(result).rejects.toThrow("the user cancelled");
      expect(await runner.next()).toEqual({ type: "cancel", call });
      expect(await runner.next()).toMatchObject({ type: "error", id: 0, code: "call-not-running" });
      expect(kitSignals[0]?.aborted).toBe(true);

      // The kit answers late: nothing more reaches the runner before its stdin closes.
      answer(new Response("late"));
      await runner.send({ type: "result", call, text: "cancelled" });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await connection.close();
      await expect(runner.next()).rejects.toThrow("Halonic closed the runner's stdin");
      expect(options.blocks).toEqual([]);
    });

    it("frees the slots of bodies left unread, so later calls can still send requests", async () => {
      const { options, runner, connection, http } = await startedRunner();
      // Eight calls, each leaving one body unread: as many as can be in flight.
      for (let id = 0; id < 8; id += 1) {
        const { result, call } = await runningCall(runner, connection);
        await runner.send(fetchFrame(id, call));
        expect(await runner.next()).toMatchObject({ type: "head", id });
        await runner.send({ type: "result", call, text: "done" });
        await result;
        expect(await runner.next()).toMatchObject({ type: "error", id, code: "call-not-running" });
      }

      const { call } = await runningCall(runner, connection);
      await runner.send(fetchFrame(8, call));
      expect(await runner.next()).toMatchObject({ type: "head", id: 8 });
      expect(http.sent).toHaveLength(9);
      expect(options.blocks).toEqual([]);
      await connection.close();
    });

    it("forgets a closed request once the runner acts in a later call", async () => {
      const { runner, connection } = await startedRunner();
      const first = await runningCall(runner, connection);
      await runner.send(fetchFrame(0, first.call));
      expect(await runner.next()).toMatchObject({ type: "head", id: 0 });
      await runner.send({ type: "result", call: first.call, text: "done" });
      await first.result;
      expect(await runner.next()).toMatchObject({ type: "error", id: 0, code: "call-not-running" });

      // A pull that crossed the next call on the wire is still ignored.
      const second = await runningCall(runner, connection);
      await runner.send({ type: "pull", body: 0 });
      // A request in the later call shows the runner has read the close.
      await runner.send(fetchFrame(1, second.call));
      expect(await runner.next()).toMatchObject({ type: "head", id: 1 });

      await runner.send({ type: "pull", body: 0 });
      expect(await connection.stopped).toEqual({
        reason: "protocol",
        detail: "a pull for a body the runner doesn't own",
      });
    });

    it("forgets a closed request once the runner answers a later ping", async () => {
      const fake = fakeRunnerProcess();
      const http = fakeKitClient(() => new Response("a body the runner may read"));
      const options = bridgeOptions(fake, { http, limits: { pingIntervalMs: 20 } });
      const runner = new HandDrivenRunner(fake);
      const connecting = connectRunner(options);
      await runner.start();
      const connection = await connecting;
      const { result, call } = await runningCall(runner, connection);
      await runner.send(fetchFrame(0, call));
      expect(await runner.next()).toMatchObject({ type: "head", id: 0 });
      await runner.send({ type: "result", call, text: "done" });
      await result;
      expect(await runner.next()).toMatchObject({ type: "error", id: 0, code: "call-not-running" });

      const ping = await runner.next();
      if (ping.type !== "ping") throw new Error(`expected a ping, got ${ping.type}`);
      await runner.send({ type: "pong", n: ping.n });
      await runner.send({ type: "cancel-body", body: 0 });
      expect(await connection.stopped).toEqual({
        reason: "protocol",
        detail: "a cancel for a body the runner doesn't own",
      });
      expect(options.blocks).toHaveLength(1);
    });

    it("still stops a runner that pulls a body it never had", async () => {
      const { runner, connection } = await startedRunner();
      const { call } = await runningCall(runner, connection);
      await runner.send(fetchFrame(0, call));
      expect(await runner.next()).toMatchObject({ type: "head", id: 0 });
      await runner.send({ type: "pull", body: 1 });
      expect(await connection.stopped).toEqual({
        reason: "protocol",
        detail: "a pull for a body the runner doesn't own",
      });
    });
  });
});
