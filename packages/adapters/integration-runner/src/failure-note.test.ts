// A changed reply's note crosses the bridge unchanged (HAL-19168): the kit's
// `ReplyChangedError` fits the failure note's limits, so Halonic gets the
// same fields the integration named, and never the reply.

import { checkReply, type ReplySchema } from "@halonicjs/adapter-integration-kit/integration";
import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { bridged } from "./bridged.test-helper.ts";
import { RunnerToolError } from "./halonic/limits.ts";
import { fakeKitClient } from "./pipes.test-helper.ts";

const canary = "CANARY-a@example.com";

/** Stands in for `z.object({ id, fulfillment, … })`; the issues are the ones Zod 4.6 gives. */
function orderReply(missing: readonly string[]): ReplySchema {
  return {
    type: "object",
    shape: Object.fromEntries(missing.map((name) => [name, { type: "object" }])),
    safeParse: () => ({
      success: false,
      error: {
        issues: missing.map((name) => ({ expected: "object", code: "invalid_type", path: [name] })),
      },
    }),
  } as ReplySchema;
}

/** The error a tool that checks this reply fails with, on Halonic's side and on the runner's. */
async function bothSides(schema: ReplySchema): Promise<{ sent: unknown; received: unknown }> {
  let sent: unknown;
  const { run } = await bridged(
    async () => {
      try {
        return JSON.stringify(checkReply(schema, { note: canary }));
      } catch (error) {
        sent = error;
        throw error;
      }
    },
    fakeKitClient(() => new Response("")),
  );
  const received = await run().catch((error: unknown) => error);
  return { sent, received };
}

verifies("integration-kit.check-reply", () => {
  it("a changed reply's note reaches Halonic as the integration sent it", async () => {
    const { sent, received } = await bothSides(orderReply(["fulfillment"]));
    expect(received).toBeInstanceOf(RunnerToolError);
    expect(errorKindOf(received)).toBe("unavailable");
    expect((received as RunnerToolError).failureCause).toEqual({
      code: "reply-changed",
      detail: { "field.1": "fulfillment", "expected.1": "object" },
    });
    expect((received as RunnerToolError).failureCause).toEqual(
      (sent as { failureCause: unknown }).failureCause,
    );
    expect(JSON.stringify(received)).not.toContain("CANARY");
  });

  it("a note for many fields fits the frame, so nothing is cut on the way", async () => {
    const missing = Array.from({ length: 10 }, (_, index) => `part${index + 1}`);
    const { sent, received } = await bothSides(orderReply(missing));
    expect((received as RunnerToolError).failureCause).toEqual(
      (sent as { failureCause: unknown }).failureCause,
    );
    expect(Object.keys((received as RunnerToolError).failureCause?.detail ?? {})).toHaveLength(8);
  });
});
