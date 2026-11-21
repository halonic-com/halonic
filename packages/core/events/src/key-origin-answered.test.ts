import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { RunEventBody } from "./run-event.ts";

type Answered = Extract<RunEventBody, { type: "key-origin.answered" }>;

verifies("events.key-origin-answered", () => {
  typeTest("names the provider, the key, the address and the answer", () => {
    expectTypeOf<Answered>().toEqualTypeOf<{
      type: "key-origin.answered";
      provider: string;
      key: string;
      origin: string;
      answer: "allowed" | "not-allowed";
    }>();
  });

  typeTest("has no answer for a wait that ended without one", () => {
    expectTypeOf<{
      type: "key-origin.answered";
      provider: string;
      key: string;
      origin: string;
      answer: "timed-out";
    }>().not.toExtend<Answered>();
  });
});
