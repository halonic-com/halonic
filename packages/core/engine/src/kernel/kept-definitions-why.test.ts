import { encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { definitionsOf, keepDefinitions } from "./kept-definitions.ts";
import {
  answer,
  KernelBlobs,
  KernelRuns,
  replyWorkflow,
  startInput,
} from "./kernel-test-kit.test-helper.ts";
import { step } from "./step.ts";

const version = "f".repeat(64);

verifies("engine.kept-definitions-why", () => {
  it("fails a run whose definitions blob isn't JSON, and says why", async () => {
    const runs = new KernelRuns();
    const blobs = new KernelBlobs();
    const kept = await keepDefinitions(blobs, { workflow: replyWorkflow });
    await step({ runs, blobs }, "r-acme", startInput(kept));
    blobs.blobs.set(kept, encodeUtf8("{"));

    const result = await step({ runs, blobs }, "r-acme", answer("call-1", "Thanks!"));

    expect(result.events).toEqual([
      expect.objectContaining({
        type: "run.failed",
        state: "draft",
        error: expect.stringMatching(/are missing from the blob store or can't be read.*JSON/s),
      }),
    ]);
  });

  it("keeps the parse error as the cause", async () => {
    const blobs = new KernelBlobs();
    blobs.blobs.set(version, encodeUtf8("{"));

    const read = definitionsOf(blobs, version);

    await expect(read).rejects.toMatchObject({ cause: expect.any(SyntaxError) });
  });

  it("says a blob without a workflow isn't definitions", async () => {
    const blobs = new KernelBlobs();
    blobs.blobs.set(version, encodeUtf8('{"agents":{}}'));

    await expect(definitionsOf(blobs, version)).rejects.toThrow("doesn't hold a workflow");
  });
});
