import type { AddressCheckingHttpClient } from "@halonicjs/adapter-http-kit";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import { createNodeHttpClient } from "./node-http-client.ts";

verifies("integration-kit.address-checking-transport", () => {
  typeTest("the Node transport is the one the integration kit's loader takes", () => {
    expectTypeOf(createNodeHttpClient).returns.toEqualTypeOf<AddressCheckingHttpClient>();
  });
});
