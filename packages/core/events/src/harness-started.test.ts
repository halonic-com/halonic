import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { RunEventBody } from "./run-event.ts";

const started = {
  type: "harness.started",
  state: "draft",
  agent: "writer",
  harness: "claude-code",
  timeoutMs: 60_000,
} as const;

verifies("events.harness-session-start", () => {
  typeTest("may say how the harness session began", () => {
    expectTypeOf({
      ...started,
      session: { start: "fresh", reason: "no-resume" },
    } as const).toExtend<RunEventBody>();
  });

  typeTest("reads a harness.started without a session, as before", () => {
    expectTypeOf(started).toExtend<RunEventBody>();
  });
});
