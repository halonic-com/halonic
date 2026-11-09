import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { Digest, ToolApproval, ToolApprovalKey, ToolApprovalStore } from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

const approval: ToolApproval = {
  location: "/workspaces/acme",
  source: "notes",
  name: "lookup",
  hash: "htl1:ab",
  approved: {
    server: {
      kind: "stdio",
      command: "npx",
      args: ["-y", "@acme/notes-mcp@2.3.1"],
      pin: {
        registry: "npm",
        registryUrl: "https://registry.npmjs.org",
        package: "@acme/notes-mcp",
        version: "2.3.1",
      },
    },
    description: "Finds a note by its title.",
    parameters: { type: "object" },
  },
  approvedAt: "2026-11-09T10:00:00.000Z",
};

verifies("ports.listed-tool-approval", () => {
  typeTest("only stores approvals: get, approve, revoke and list", () => {
    expectTypeOf<keyof ToolApprovalStore>().toEqualTypeOf<"get" | "approve" | "revoke" | "list">();
    expectTypeOf<ToolApprovalStore["get"]>().parameters.toEqualTypeOf<[key: ToolApprovalKey]>();
    expectTypeOf<ToolApprovalStore["get"]>().returns.toEqualTypeOf<Promise<ToolApproval | null>>();
    expectTypeOf<ToolApprovalStore["approve"]>().parameters.toEqualTypeOf<
      [approval: ToolApproval]
    >();
    expectTypeOf<ToolApprovalStore["list"]>().parameters.toEqualTypeOf<
      [location: string, source: string]
    >();
    expectTypeOf<ToolApprovalStore["list"]>().returns.toEqualTypeOf<Promise<ToolApproval[]>>();
  });

  typeTest("hashes through a Digest port, not through code of its own", () => {
    expectTypeOf<Digest["sha256"]>().parameters.toEqualTypeOf<[data: Uint8Array]>();
    expectTypeOf<Digest["sha256"]>().returns.toEqualTypeOf<Promise<Uint8Array>>();
  });

  it("keeps the hash and the server with each approval", () => {
    // @ts-expect-error: an approval is tied to a hash
    const unbound: ToolApproval = { ...approval, hash: undefined };
    const withoutServer: ToolApproval = {
      ...approval,
      // @ts-expect-error: the server is part of what was approved
      approved: { description: "", parameters: {} },
    };
    const withHeaders: ToolApproval = {
      ...approval,
      approved: {
        ...approval.approved,
        // @ts-expect-error: headers hold secrets, so the server leaves them out
        server: { kind: "http", url: "https://notes.example.com/mcp", headers: {} },
      },
    };
    expect(approval.approved.server.kind).toBe("stdio");
    expect([unbound, withoutServer, withHeaders]).toHaveLength(3);
  });
});
