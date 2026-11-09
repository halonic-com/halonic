import { encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { keepDefinitions, readDefinitions } from "./kept-definitions.ts";
import {
  answer,
  KernelBlobs,
  KernelRuns,
  replyWorkflow,
  startInput,
} from "./kernel-test-kit.test-helper.ts";
import { step } from "./step.ts";

verifies("engine.kept-definitions", () => {
  describe("kept definitions", () => {
    it("reads back the definitions a run started with, under one hash for the same definitions", async () => {
      const blobs = new KernelBlobs();

      const version = await keepDefinitions(blobs, { workflow: replyWorkflow });

      expect(await keepDefinitions(blobs, { workflow: { ...replyWorkflow } })).toBe(version);
      expect(await readDefinitions(blobs, version)).toEqual({ workflow: replyWorkflow });
    });

    it.each([
      ["missing", null],
      ["not JSON", "{"],
      ["JSON without a workflow", '{"agents":{}}'],
    ])("reads a blob that is %s as no definitions", async (_name, text) => {
      const blobs = new KernelBlobs();
      if (text !== null) {
        blobs.blobs.set("f".repeat(64), encodeUtf8(text));
      }

      expect(await readDefinitions(blobs, "f".repeat(64))).toBeNull();
    });

    it("refuses to start a run whose definitions are missing, and stores nothing", async () => {
      const runs = new KernelRuns();
      const blobs = new KernelBlobs();

      await expect(step({ runs, blobs }, "r-acme", startInput("f".repeat(64)))).rejects.toThrow(
        "are missing from the blob store",
      );
      expect(await runs.events("r-acme")).toEqual([]);
    });

    it("fails a run whose definitions went missing, without reading today's files", async () => {
      const runs = new KernelRuns();
      const blobs = new KernelBlobs();
      const version = await keepDefinitions(blobs, { workflow: replyWorkflow });
      await step({ runs, blobs }, "r-acme", startInput(version));
      blobs.blobs.clear();

      const result = await step({ runs, blobs }, "r-acme", answer("call-1", "Thanks!"));

      expect(result.effects).toEqual([]);
      expect(result.run.status).toBe("failed");
      expect(result.events).toEqual([
        expect.objectContaining({
          type: "run.failed",
          state: "draft",
          reason: "error",
          error: expect.stringContaining(`(version ${version}) are missing from the blob store`),
        }),
      ]);
    });
  });
});
