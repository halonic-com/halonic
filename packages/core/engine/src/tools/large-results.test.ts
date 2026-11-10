import { decodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { halonicTool, MemoryTurnLog, runTestTurn } from "../agent/turn-test-kit.test-helper.ts";
import { KernelBlobs } from "../kernel/kernel-test-kit.test-helper.ts";
import { call, callAnswer, textAnswer } from "../testing/scripted-model.ts";
import { LargeResultsTurnLog, maxLoggedResultBytes, resultStartLength } from "./large-results.ts";

function exportTurn(result: string, log: LargeResultsTurnLog) {
  return runTestTurn({
    answers: [callAnswer(call("c1", "export")), textAnswer("Exported")],
    halonicTools: [halonicTool("export", async () => result)],
    log,
  });
}

verifies("engine.large-results-to-blobs", () => {
  describe("LargeResultsTurnLog", () => {
    it("keeps a result over 256 KB in the blob store and its start in the log", async () => {
      const blobs = new KernelBlobs();
      const log = new MemoryTurnLog();
      const result = "row;".repeat(75_000);

      const { model } = await exportTurn(result, new LargeResultsTurnLog(log, blobs));

      const logged = log.events.find((event) => event.type === "tool.result");
      expect(logged).toEqual({
        type: "tool.result",
        agent: "clerk",
        tool: "export",
        result: result.slice(0, resultStartLength),
        outcome: "ok",
        resultBlob: { hash: expect.any(String), size: 300_000, mediaType: "text/plain" },
      });
      const stored = await blobs.get(
        logged?.type === "tool.result" ? (logged.resultBlob?.hash ?? "") : "",
      );
      expect(stored === null ? null : decodeUtf8(stored)).toBe(result);
      // The model still gets the whole result.
      expect(model.requests[1]?.messages.at(-1)?.content).toBe(result);
    });

    it("counts bytes, not characters, and keeps a result of exactly 256 KB in the log", async () => {
      const blobs = new KernelBlobs();
      const log = new MemoryTurnLog();
      const atLimit = "a".repeat(maxLoggedResultBytes);
      const wide = "é".repeat(maxLoggedResultBytes / 2 + 1);

      await new LargeResultsTurnLog(log, blobs).append({
        type: "tool.result",
        agent: "clerk",
        tool: "export",
        result: atLimit,
      });
      await new LargeResultsTurnLog(log, blobs).append({
        type: "tool.result",
        agent: "clerk",
        tool: "export",
        result: wide,
      });

      expect(log.events[0]).toEqual({
        type: "tool.result",
        agent: "clerk",
        tool: "export",
        result: atLimit,
      });
      expect(log.events[1]).toMatchObject({ resultBlob: { size: maxLoggedResultBytes + 2 } });
      expect(blobs.blobs.size).toBe(1);
    });

    it("passes every other event on as it is", async () => {
      const log = new MemoryTurnLog();
      const blobs = new KernelBlobs();
      const args = { rows: "x".repeat(maxLoggedResultBytes + 1) };

      await new LargeResultsTurnLog(log, blobs).append({
        type: "tool.called",
        agent: "clerk",
        tool: "import",
        args,
      });

      expect(log.events).toEqual([{ type: "tool.called", agent: "clerk", tool: "import", args }]);
      expect(blobs.blobs.size).toBe(0);
    });

    it("writes no event and stops the turn when the blob can't be stored", async () => {
      const log = new MemoryTurnLog();
      const full = { put: () => Promise.reject(new Error("blob store is full")) };

      await expect(
        exportTurn("x".repeat(maxLoggedResultBytes + 1), new LargeResultsTurnLog(log, full)),
      ).rejects.toThrow("blob store is full");
      expect(log.events.some((event) => event.type === "tool.result")).toBe(false);
    });
  });
});
