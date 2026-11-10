import { verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { ConnectorCallOptions, ConnectorClient } from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them.

/** An adapter written before the hints: its `callTool` takes no options. */
const before: ConnectorClient = {
  id: "mail",
  listTools: async () => [],
  callTool: async (name: string, args: Record<string, unknown>) =>
    `${name} ${JSON.stringify(args)}`,
  close: async () => {},
};

verifies("ports.connector-call-hints", () => {
  it("takes the hints as an optional object, which an adapter may leave out", async () => {
    expectTypeOf<ConnectorClient["callTool"]>()
      .parameter(2)
      .toEqualTypeOf<ConnectorCallOptions | undefined>();
    expectTypeOf<ConnectorCallOptions>().toEqualTypeOf<{ readonly idempotencyKey?: string }>();
    expect(await before.callTool("send_note", { to: "support" })).toBe(
      'send_note {"to":"support"}',
    );
    expect(
      await before.callTool("send_note", { to: "support" }, { idempotencyKey: "r-acme:call-2" }),
    ).toBe('send_note {"to":"support"}');
  });
});
