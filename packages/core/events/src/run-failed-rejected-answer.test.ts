import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { RejectedAnswer } from "./run-basics.ts";
import type { RunEventBody } from "./run-event.ts";

type RunFailed = Extract<RunEventBody, { type: "run.failed" }>;

verifies("events.run-failed-rejected-answer", () => {
  typeTest("lets run.failed carry the answer that failed the run, in full", () => {
    expectTypeOf<RunFailed["rejected"]>().toEqualTypeOf<RejectedAnswer | undefined>();
    expectTypeOf<RejectedAnswer>().toEqualTypeOf<{
      readonly answer: string;
      readonly parseError?: string;
    }>();
    expectTypeOf<{ type: "run.failed"; state: null; error: string }>().toExtend<RunFailed>();
  });
});
