import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { RunEventBody } from "./run-event.ts";

type Asked = Extract<RunEventBody, { type: "key-origin.asked" }>;

verifies("events.key-origin-asked", () => {
  typeTest("names the provider, the key and the address", () => {
    expectTypeOf<Asked>().toEqualTypeOf<{
      type: "key-origin.asked";
      provider: string;
      key: string;
      origin: string;
    }>();
  });

  typeTest("has no field for the key's value", () => {
    expectTypeOf<Asked>().not.toHaveProperty("value");
  });
});
