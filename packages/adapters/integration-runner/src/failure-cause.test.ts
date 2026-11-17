// A failed call's kind and cause cross the bridge (HAL-11593): the runner
// sends them in the `result` frame and Halonic puts them on the error the
// call rejects with, where the engine's `failureCauseOf` reads them.

import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { bridged } from "./bridged.test-helper.ts";
import { maxFrameBytes } from "./frames.ts";
import { connectRunner } from "./halonic/connect-runner.ts";
import { RunnerToolError } from "./halonic/limits.ts";
import {
  bridgeOptions,
  fakeKitClient,
  fakeRunnerProcess,
  fakeSecret,
  HandDrivenRunner,
} from "./pipes.test-helper.ts";

const apiOff = {
  code: "google.api-disabled",
  detail: { api: "drive.googleapis.com", project: "example-project" },
};

/** The error a tool failed with, as the bridge delivers it. */
async function failureOf(thrown: unknown): Promise<unknown> {
  const { run } = await bridged(
    async () => {
      throw thrown;
    },
    fakeKitClient(() => new Response("")),
  );
  return await run().catch((error: unknown) => error);
}

verifies("integration-runner.failure-cause", () => {
  describe("a failed call's kind and cause", () => {
    it("reach Halonic's side from an integration's error", async () => {
      const error = await failureOf(
        Object.assign(new Error("The API is off."), { kind: "denied", failureCause: apiOff }),
      );
      expect(error).toBeInstanceOf(RunnerToolError);
      expect(errorKindOf(error)).toBe("denied");
      expect(error).toMatchObject({
        message: "The API is off.",
        kind: "denied",
        failureCause: apiOff,
      });
    });

    it("are absent for an error without a kind", async () => {
      const error = await failureOf(new Error("It broke."));
      expect(error).toBeInstanceOf(RunnerToolError);
      expect(error).not.toHaveProperty("kind");
      expect(error).not.toHaveProperty("failureCause");
    });

    it("leave out what doesn't fit the frame, and keep the rest", async () => {
      const error = await failureOf(
        Object.assign(new Error("Too much."), {
          kind: "unavailable",
          failureCause: {
            code: "x".repeat(65),
            detail: { api: "drive", long: "v".repeat(301), ["k".repeat(41)]: "short" },
          },
        }),
      );
      expect(error).toMatchObject({
        kind: "unavailable",
        failureCause: { detail: { api: "drive" } },
      });
      expect((error as RunnerToolError).failureCause).not.toHaveProperty("code");
    });

    it("don't make a result larger than a frame fail the runner", async () => {
      const error = await failureOf(
        Object.assign(new Error("m".repeat(10)), {
          kind: "denied",
          failureCause: { detail: { a: "b".repeat(300) } },
        }),
      );
      expect(JSON.stringify(error).length).toBeLessThan(maxFrameBytes);
    });
  });

  describe("on Halonic's side", () => {
    async function resultFrom(frame: Record<string, unknown>): Promise<unknown> {
      const fake = fakeRunnerProcess();
      const runner = new HandDrivenRunner(fake);
      const connecting = connectRunner(bridgeOptions(fake));
      await runner.start();
      const connection = await connecting;
      const result = connection.callTool("forecast", {});
      await runner.send({ type: "result", call: 0, ...frame } as never);
      const error = await result.catch((e: unknown) => e);
      await connection.close();
      return error;
    }

    it("a kind that is not an error kind is dropped", async () => {
      const error = await resultFrom({ error: "No.", kind: "teapot" });
      expect(error).toBeInstanceOf(RunnerToolError);
      expect(error).not.toHaveProperty("kind");
    });

    it("a value the secret filter changes is dropped, and the others stay", async () => {
      const error = await resultFrom({
        error: "No.",
        kind: "denied",
        failureCause: { code: "x.y", detail: { api: "drive", leaked: `key ${fakeSecret}` } },
      });
      expect(error).toMatchObject({
        kind: "denied",
        failureCause: { code: "x.y", detail: { api: "drive" } },
      });
      expect(JSON.stringify(error)).not.toContain(fakeSecret);
    });
  });
});
