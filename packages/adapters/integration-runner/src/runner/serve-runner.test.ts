import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { readFrameLines } from "../frame-lines.ts";
import { maxFrameBytes } from "../frames.ts";
import { RunnerProtocolError, serveRunner } from "./serve-runner.ts";

const encoder = new TextEncoder();

/** The runner's side with Halonic played by the test: `halonic` writes lines, `frames` reads the runner's. */
function servedRunner(callTool: () => Promise<string>) {
  const toRunner = new TransformStream<Uint8Array, Uint8Array>();
  const fromRunner = new TransformStream<Uint8Array, Uint8Array>();
  const serving = serveRunner({
    input: toRunner.readable,
    output: fromRunner.writable,
    nonce: "nonce-for-this-start",
    connect: async () => ({
      declaration: { name: "example", version: "1.0.0", tools: [runTool] },
      connection: { callTool, close: async () => undefined },
    }),
  });
  serving.catch(() => undefined);
  const writer = toRunner.writable.getWriter();
  const halonic = (frame: object) => writer.write(encoder.encode(`${JSON.stringify(frame)}\n`));
  const frames = readFrameLines(fromRunner.readable)[Symbol.asyncIterator]();
  const next = async () => (await frames.next()).value;
  return { serving, halonic, next, closeInput: () => writer.close() };
}

const start = { type: "start", settings: {}, tools: ["run"] };

/** The integration's one tool. */
const runTool = {
  name: "run",
  description: "Runs.",
  parameters: { type: "object", properties: {} },
  risk: "read" as const,
};

verifies("integration-runner.frames", () => {
  describe("the runner's side", () => {
    it("says ready with its nonce first", async () => {
      const { next, halonic, closeInput, serving } = servedRunner(async () => "");
      expect(await next()).toEqual({ type: "ready", nonce: "nonce-for-this-start" });
      await halonic(start);
      await next();
      await closeInput();
      await serving;
    });

    it("ends with an error when Halonic's first frame isn't start", async () => {
      const { serving, halonic } = servedRunner(async () => "");
      await halonic({ type: "ping", n: 0 });
      await expect(serving).rejects.toBeInstanceOf(RunnerProtocolError);
    });

    it("ends with an error on a second start", async () => {
      const { serving, halonic } = servedRunner(async () => "");
      await halonic(start);
      await halonic(start);
      await expect(serving).rejects.toThrow("a second start");
    });

    it("answers a result too large for a frame with an error instead of writing it", async () => {
      const { next, halonic, closeInput, serving } = servedRunner(async () =>
        "x".repeat(maxFrameBytes),
      );
      await next();
      await halonic(start);
      await next();
      await halonic({ type: "call", call: 0, name: "run", args: {} });
      expect(await next()).toEqual({
        type: "result",
        call: 0,
        error: "the tool result is too large to send",
      });
      await closeInput();
      await serving;
    });

    it("answers a ping with its pong", async () => {
      const { next, halonic, closeInput, serving } = servedRunner(async () => "");
      await next();
      await halonic(start);
      await next();
      await halonic({ type: "ping", n: 7 });
      expect(await next()).toEqual({ type: "pong", n: 7 });
      await closeInput();
      await serving;
    });
  });
});
