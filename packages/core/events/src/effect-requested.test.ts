import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { AgentResume } from "./agent-resume.ts";
import type { RunEventBody } from "./run-event.ts";

type EffectRequested = Extract<RunEventBody, { type: "effect.requested" }>;

verifies("events.effect-requested", () => {
  typeTest("names the step, the agent, the call, its key and where the agent goes on", () => {
    expectTypeOf<EffectRequested>().toEqualTypeOf<{
      type: "effect.requested";
      state: string;
      agent: string;
      connector: string;
      tool: string;
      args: unknown;
      callId: string;
      idempotencyKey: string;
      resume: AgentResume;
    }>();
  });

  typeTest("doesn't accept the event without its key", () => {
    expectTypeOf<{
      type: "effect.requested";
      state: string;
      agent: string;
      connector: string;
      tool: string;
      args: unknown;
      callId: string;
      resume: AgentResume;
    }>().not.toExtend<EffectRequested>();
  });
});
