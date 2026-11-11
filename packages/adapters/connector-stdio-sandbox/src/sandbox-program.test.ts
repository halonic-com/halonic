import type { SandboxExit, SandboxProcess } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { sandboxProgram } from "./sandbox-program.ts";

/**
 * A sandbox process whose input never takes a write, like a full pipe whose
 * stream doesn't reject when the program ends, and whose output a test feeds.
 */
function stuckProcess() {
  const { promise: exited, resolve: exit } = Promise.withResolvers<SandboxExit>();
  let output: ReadableStreamDefaultController<Uint8Array> | undefined;
  let outputCancelled = false;
  let kills = 0;
  const process: SandboxProcess = {
    stdin: new WritableStream({ write: () => new Promise(() => undefined) }, { highWaterMark: 0 }),
    stdout: new ReadableStream({
      start: (controller) => {
        output = controller;
      },
      cancel: () => {
        outputCancelled = true;
      },
    }),
    stderr: new ReadableStream({ start: (controller) => controller.close() }),
    exited,
    kill: async () => {
      kills += 1;
      exit({ code: null, signal: "SIGKILL", reason: "stopped" });
    },
  };
  return {
    process,
    exit,
    push: (text: string) => output?.enqueue(new TextEncoder().encode(text)),
    outputCancelled: () => outputCancelled,
    kills: () => kills,
  };
}

verifies("connector-stdio-sandbox.session-start", () => {
  describe("a sandbox process as a running program", () => {
    it("settles a write waiting on a full input once the program has ended", async () => {
      const stuck = stuckProcess();
      const program = sandboxProgram(stuck.process);
      const write = program.write("{}\n");
      stuck.exit({ code: 1, signal: null, reason: "exited" });
      await expect(write).rejects.toThrow("The program has ended");
      expect(await program.exited).toEqual({ code: 1, signal: null });
    });

    it("stops the program for both terminate and kill, and never throws ending the input twice", async () => {
      const stuck = stuckProcess();
      const program = sandboxProgram(stuck.process);
      program.endInput();
      program.endInput();
      program.signal("terminate");
      program.signal("kill");
      expect(await program.exited).toEqual({ code: null, signal: "SIGKILL" });
      expect(stuck.kills()).toBe(2);
    });

    it("hands on the output as it comes, and cancels it when the reader stops early", async () => {
      const stuck = stuckProcess();
      const program = sandboxProgram(stuck.process);
      stuck.push("first");
      stuck.push("second");
      const decoder = new TextDecoder();
      const read: string[] = [];
      for await (const chunk of program.stdout) {
        read.push(decoder.decode(chunk));
        if (read.length === 2) break;
      }
      expect(read).toEqual(["first", "second"]);
      expect(stuck.outputCancelled()).toBe(true);
    });
  });
});
