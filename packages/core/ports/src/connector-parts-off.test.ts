import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import { type ConnectorClient, type ConnectorPartOff, forwardedPartsOff } from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them.

verifies("ports.connector-parts-off", () => {
  typeTest("is optional, so an adapter written before it still implements the port", () => {
    const before = {
      id: "mail",
      listTools: async () => [],
      callTool: async () => "",
      close: async () => {},
    };
    expectTypeOf(before).toExtend<ConnectorClient>();
    expectTypeOf<ConnectorClient["newPartsOff"]>().toEqualTypeOf<
      (() => readonly ConnectorPartOff[]) | undefined
    >();
  });

  typeTest("gives a part and a reason code, never an error's text", () => {
    expectTypeOf<{
      part: "local:lister";
      reason: "sandbox-unavailable";
    }>().toExtend<ConnectorPartOff>();
    expectTypeOf<{
      part: "backend";
      reason: "exited with code 1";
    }>().not.toExtend<ConnectorPartOff>();
  });
});

verifies("ports.connector-parts-off", () => {
  it("lets a wrapper give the parts off of the connector it wraps", () => {
    const inner: ConnectorClient = {
      id: "weather",
      listTools: async () => [],
      callTool: async () => "",
      newPartsOff: () => [{ part: "local:lister", reason: "sandbox-unavailable" }],
      close: async () => {},
    };
    const wrapper: ConnectorClient = { ...inner, ...forwardedPartsOff(inner) };
    expect(wrapper.newPartsOff?.()).toEqual([
      { part: "local:lister", reason: "sandbox-unavailable" },
    ]);
  });

  it("gives a wrapper no method when the connector has none", () => {
    const inner: ConnectorClient = {
      id: "notes",
      listTools: async () => [],
      callTool: async () => "",
      close: async () => {},
    };
    expect(forwardedPartsOff(inner)).toEqual({});
  });
});
