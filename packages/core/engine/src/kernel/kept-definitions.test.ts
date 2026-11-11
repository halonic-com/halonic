import { encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { definitionsOf, keepDefinitions, UnreadableDefinitions } from "./kept-definitions.ts";
import {
  answer,
  KernelBlobs,
  KernelRuns,
  replyWorkflow,
  startInput,
  writerAgent,
} from "./kernel-test-kit.test-helper.ts";
import { step } from "./step.ts";

verifies("engine.kept-definitions", () => {
  describe("kept definitions", () => {
    it("reads back the definitions a run started with, under one hash for the same definitions", async () => {
      const blobs = new KernelBlobs();

      const version = await keepDefinitions(blobs, { workflow: replyWorkflow });

      expect(await keepDefinitions(blobs, { workflow: { ...replyWorkflow } })).toBe(version);
      expect(await definitionsOf(blobs, version)).toEqual({ workflow: replyWorkflow });
    });

    it("reads back the agents and workflows a run started with", async () => {
      const blobs = new KernelBlobs();
      const definitions = {
        workflow: replyWorkflow,
        agents: { writer: writerAgent("codex") },
        workflows: { reply: replyWorkflow },
      };

      const version = await keepDefinitions(blobs, definitions);

      expect(await definitionsOf(blobs, version)).toEqual(definitions);
    });

    it.each([
      ["missing", null],
      ["not JSON", "{"],
      ["JSON without a workflow", '{"agents":{}}'],
      ["a workflow with agents that aren't an object", '{"workflow":{},"agents":[]}'],
      ["a workflow with workflows that aren't an object", '{"workflow":{},"workflows":[]}'],
    ])("refuses a blob that is %s as definitions", async (_name, text) => {
      const blobs = new KernelBlobs();
      if (text !== null) {
        blobs.blobs.set("f".repeat(64), encodeUtf8(text));
      }

      await expect(definitionsOf(blobs, "f".repeat(64))).rejects.toThrow(UnreadableDefinitions);
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
