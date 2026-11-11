import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { readFrameLines } from "../frame-lines.ts";
import {
  bridgeOptions,
  fakeRunnerProcess,
  HandDrivenRunner,
  testDeclaration,
  testNonce,
} from "../pipes.test-helper.ts";
import { serveRunner } from "../runner/serve-runner.ts";
import { connectRunner } from "./connect-runner.ts";
import type { RunnerLimits } from "./limits.ts";

/** A started connection with a hand-driven runner behind it. */
async function startedRunner() {
  const fake = fakeRunnerProcess();
  const runner = new HandDrivenRunner(fake);
  const connecting = connectRunner(bridgeOptions(fake));
  await runner.start();
  return { runner, connection: await connecting };
}

verifies("integration-runner.declaration", () => {
  describe("the runner's side", () => {
    it("declares after start with only the fields the protocol knows", async () => {
      const toRunner = new TransformStream<Uint8Array, Uint8Array>();
      const fromRunner = new TransformStream<Uint8Array, Uint8Array>();
      const tool = {
        name: "run",
        description: "Runs.",
        parameters: { type: "object", properties: {} },
        risk: "read" as const,
        untrusted: true,
        examples: ["run it"],
      };
      const serving = serveRunner({
        input: toRunner.readable,
        output: fromRunner.writable,
        nonce: testNonce,
        connect: async () => ({
          declaration: { name: "example", version: "1.0.0", tools: [tool] },
          connection: { callTool: async () => "", close: async () => undefined },
        }),
      });
      const frames = readFrameLines(fromRunner.readable)[Symbol.asyncIterator]();
      const writer = toRunner.writable.getWriter();
      expect((await frames.next()).value).toMatchObject({ type: "ready" });
      await writer.write(
        new TextEncoder().encode(`${JSON.stringify({ type: "start", settings: {}, tools: [] })}\n`),
      );
      const { examples: _examples, ...known } = tool;
      expect((await frames.next()).value).toEqual({
        type: "declared",
        name: "example",
        version: "1.0.0",
        tools: [known],
      });
      await writer.close();
      await serving;
    });
  });

  describe("Halonic's side", () => {
    /** A runner that has said `ready` and has `start`, but hasn't declared yet. */
    async function declaringRunner(limits: Partial<RunnerLimits> = {}) {
      const fake = fakeRunnerProcess();
      const options = bridgeOptions(fake, { limits });
      const runner = new HandDrivenRunner(fake);
      const connecting = connectRunner(options);
      connecting.catch(() => undefined);
      await runner.send({ type: "ready", nonce: testNonce });
      await runner.next();
      return { fake, options, runner, connecting };
    }

    it("hands over what the integration declared, frozen", async () => {
      const { connection } = await startedRunner();
      expect(connection.declaration).toEqual(testDeclaration);
      expect(Object.isFrozen(connection.declaration)).toBe(true);
      expect(Object.isFrozen(connection.declaration.tools[0])).toBe(true);
      await connection.close();
    });

    it("refuses any other frame before declared", async () => {
      const { runner, connecting, options } = await declaringRunner();
      await runner.send({ type: "pong", n: 0 });
      await expect(connecting).rejects.toMatchObject({
        stop: { reason: "protocol", detail: "a frame before declared" },
      });
      expect(options.blocks).toHaveLength(1);
    });

    it("refuses a second declared", async () => {
      const { runner, connection } = await startedRunner();
      await runner.send({ type: "declared", ...testDeclaration });
      expect(await connection.stopped).toEqual({
        reason: "protocol",
        detail: "a second declared",
      });
    });

    const outsideTheShape: [string, object][] = [
      ["an unknown risk", { risk: "delete" }],
      ["a field the protocol doesn't know", { examples: ["run it"] }],
      ["parameters that aren't an object", { parameters: "anything" }],
    ];
    it.each(outsideTheShape)("refuses a declared tool with %s", async (_what, change) => {
      const { runner, connecting } = await declaringRunner();
      const [tool] = testDeclaration.tools;
      await runner.send({ type: "declared", ...testDeclaration, tools: [{ ...tool, ...change }] });
      await expect(connecting).rejects.toMatchObject({
        stop: { reason: "protocol", detail: "a frame outside the protocol" },
      });
    });

    it("stops a runner that never declares, within the time for ready", async () => {
      const { connecting, fake } = await declaringRunner({ readyTimeoutMs: 20 });
      await expect(connecting).rejects.toMatchObject({ stop: { reason: "unresponsive" } });
      expect(fake.kills()).toBe(1);
    });
  });
});
