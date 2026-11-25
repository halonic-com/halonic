import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import { states } from "../generated/states.ts";
import type { StateHandler, StateRegistry } from "./registry.ts";

verifies("engine.state-registry", () => {
  typeTest("lists every built state type, typed against the registry", () => {
    expectTypeOf(states).toMatchTypeOf<StateRegistry>();
    expectTypeOf(states.task).toEqualTypeOf<StateHandler<"task">>();
    expectTypeOf<keyof typeof states>().toEqualTypeOf<
      "final" | "foreach" | "parallel" | "rule" | "task" | "tool" | "wait" | "workflow"
    >();
  });
});
