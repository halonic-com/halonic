import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { TargetPorts } from "./target-ports.ts";

// The suite itself is run by each target (the contracts nest `verifies()` themselves, so this one
// can't wrap them); what it promises about the target's side is the shape of `TargetPorts`.
verifies("contracts.target-ports", () => {
  typeTest("asks a target for one maker per port, and none is optional", () => {
    expectTypeOf<keyof TargetPorts>().toEqualTypeOf<
      | "clock"
      | "blobs"
      | "records"
      | "secrets"
      | "tokens"
      | "definitions"
      | "coordination"
      | "scheduler"
      | "passwords"
    >();
    expectTypeOf<Partial<TargetPorts>>().not.toEqualTypeOf<TargetPorts>();
  });
});
