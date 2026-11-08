import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { TrustRecord, TrustStore } from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

const record: TrustRecord = {
  location: "/workspaces/acme",
  fingerprint: "hfp1:ab",
  content: { programs: [] },
  grantedAt: "2026-11-08T10:00:00.000Z",
  appVersion: "0.1.0",
  pins: {
    mail: {
      registry: "npm",
      registryUrl: "https://registry.npmjs.org",
      package: "@acme/mail-mcp",
      version: "2.3.1",
    },
  },
  origin: "prompt",
};

verifies("ports.trust-store", () => {
  typeTest("only stores records: get, grant, revoke and list", () => {
    expectTypeOf<keyof TrustStore>().toEqualTypeOf<"get" | "grant" | "revoke" | "list">();
    expectTypeOf<TrustStore["get"]>().parameters.toEqualTypeOf<[location: string]>();
    expectTypeOf<TrustStore["get"]>().returns.toEqualTypeOf<Promise<TrustRecord | null>>();
    expectTypeOf<TrustStore["grant"]>().parameters.toEqualTypeOf<[record: TrustRecord]>();
    expectTypeOf<TrustStore["list"]>().returns.toEqualTypeOf<Promise<TrustRecord[]>>();
  });

  it("keeps the fingerprint, the content and the pins with each record", () => {
    // @ts-expect-error: a record is tied to a fingerprint
    const unbound: TrustRecord = { ...record, fingerprint: undefined };
    // @ts-expect-error: only a person grants trust, so there is no agent origin
    const byAgent: TrustRecord = { ...record, origin: "agent" };
    expect(record.pins["mail"]?.version).toBe("2.3.1");
    expect([unbound, byAgent]).toHaveLength(2);
  });
});
