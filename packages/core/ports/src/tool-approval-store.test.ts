import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
  type Digest,
  isUnreadableToolApprovalError,
  type ListedToolFingerprint,
  maxWaitingVersions,
  type ToolApproval,
  type ToolApprovalKey,
  type ToolApprovalStore,
  type ToolServer,
  UnreadableToolApprovalError,
  type WaitingVersion,
  type WrittenDigest,
} from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

const approval: ToolApproval = {
  location: "/workspaces/acme",
  source: "notes",
  name: "lookup",
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
    cwd: ".",
    env: null,
    secretEnv: null,
  },
  fingerprint: "htl1:ab",
  tool: {
    name: "notes__lookup",
    description: "Finds a note by its title.",
    parameters: { type: "object" },
  },
  approvedAt: "2026-11-09T10:00:00.000Z",
};

verifies("ports.listed-tool-approval", () => {
  typeTest("only stores: get, approve, revoke, list and noteWaiting", () => {
    expectTypeOf<keyof ToolApprovalStore>().toEqualTypeOf<
      "get" | "approve" | "revoke" | "list" | "noteWaiting"
    >();
    expectTypeOf<ToolApprovalStore["get"]>().parameters.toEqualTypeOf<[key: ToolApprovalKey]>();
    expectTypeOf<ToolApprovalStore["get"]>().returns.toEqualTypeOf<Promise<ToolApproval | null>>();
    expectTypeOf<ToolApprovalStore["approve"]>().parameters.toEqualTypeOf<
      [approval: ToolApproval]
    >();
    expectTypeOf<ToolApprovalStore["list"]>().parameters.toEqualTypeOf<
      [location: string, source: string]
    >();
    expectTypeOf<ToolApprovalStore["list"]>().returns.toEqualTypeOf<Promise<ToolApproval[]>>();
    expectTypeOf<ToolApprovalStore["noteWaiting"]>().parameters.toEqualTypeOf<
      [key: ToolApprovalKey, version: WaitingVersion]
    >();
    expectTypeOf<ToolApprovalStore["noteWaiting"]>().returns.toEqualTypeOf<
      Promise<WaitingVersion[]>
    >();
  });

  typeTest("hashes through a Digest port, not through code of its own", () => {
    expectTypeOf<Digest["sha256"]>().parameters.toEqualTypeOf<[data: Uint8Array]>();
    expectTypeOf<Digest["sha256"]>().returns.toEqualTypeOf<Promise<Uint8Array>>();
  });

  it("names an approval that can't be read by its source and tool, as fields", () => {
    const cause = new SyntaxError("Unexpected end of JSON input");
    const error = new UnreadableToolApprovalError(
      { location: "/workspaces/acme", source: "notes" },
      "lookup",
      'The approval for tool "lookup" can\'t be read.',
      { cause },
    );
    expect(error).toMatchObject({
      name: "UnreadableToolApprovalError",
      location: "/workspaces/acme",
      source: "notes",
      toolName: "lookup",
      cause,
    });
    expect(isUnreadableToolApprovalError(error)).toBe(true);

    // One from another copy of this package is recognised by its name and fields.
    const copied = Object.assign(new Error("copied"), {
      name: "UnreadableToolApprovalError",
      location: "/workspaces/acme",
      source: "notes",
      toolName: null,
    });
    expect(isUnreadableToolApprovalError(copied)).toBe(true);
    expect(isUnreadableToolApprovalError({ ...copied })).toBe(false);
    expect(isUnreadableToolApprovalError(Object.assign(copied, { toolName: 3 }))).toBe(false);
    expect(isUnreadableToolApprovalError(new Error("The approval can't be read."))).toBe(false);
  });

  it("keeps the server, the fingerprint and the tool as shown with each approval", () => {
    // @ts-expect-error: an approval is tied to a fingerprint
    const unbound: ToolApproval = { ...approval, fingerprint: undefined };
    // @ts-expect-error: an approval holds only at the server it was given at
    const withoutServer: ToolApproval = { ...approval, server: undefined };
    const withHeaderText: ToolApproval = {
      ...approval,
      // @ts-expect-error: headers may hold a typed-in token, so only their digest is kept
      server: { kind: "http", url: "https://notes.example.com/mcp", headers: { "X-Team": "a" } },
    };
    const withoutEnv: ToolApproval = {
      ...approval,
      // @ts-expect-error: a stdio server's environment is part of its address
      server: {
        kind: "stdio",
        command: "notes-mcp",
        args: [],
        pin: null,
        cwd: ".",
        secretEnv: null,
      },
    };
    const withoutSecretEnv: ToolApproval = {
      ...approval,
      // @ts-expect-error: a stdio server's secret environment is part of its address
      server: { kind: "stdio", command: "notes-mcp", args: [], pin: null, cwd: ".", env: null },
    };
    const withoutCwd: ToolApproval = {
      ...approval,
      // @ts-expect-error: the folder a stdio server starts in is part of its address
      server: {
        kind: "stdio",
        command: "notes-mcp",
        args: [],
        pin: null,
        env: null,
        secretEnv: null,
      },
    };
    const withoutSettings: ToolApproval = {
      ...approval,
      // @ts-expect-error: an integration's settings, such as its server's url, are part of its address
      server: { kind: "integration", id: "notes", version: "1.2.0" },
    };
    // @ts-expect-error: a fingerprint names its version, `htl1:`
    const unversioned: ToolApproval = { ...approval, fingerprint: "ab" };
    expect(approval.tool.name).toBe("notes__lookup");
    expect([
      unbound,
      withoutServer,
      withHeaderText,
      withoutEnv,
      withoutSecretEnv,
      withoutCwd,
      withoutSettings,
      unversioned,
    ]).toHaveLength(8);
  });

  typeTest("types the fingerprint as htl1: text", () => {
    expectTypeOf<ToolApproval["fingerprint"]>().toEqualTypeOf<ListedToolFingerprint>();
    expectTypeOf<WaitingVersion["fingerprint"]>().toEqualTypeOf<`htl1:${string}`>();
  });

  typeTest("keeps headers and the environment only as a sha256: digest", () => {
    expectTypeOf<WrittenDigest>().toEqualTypeOf<`sha256:${string}`>();
    expectTypeOf<
      Extract<ToolServer, { kind: "http" }>["headers"]
    >().toEqualTypeOf<WrittenDigest | null>();
    expectTypeOf<
      Extract<ToolServer, { kind: "stdio" }>["env"]
    >().toEqualTypeOf<WrittenDigest | null>();
    expectTypeOf<
      Extract<ToolServer, { kind: "stdio" }>["secretEnv"]
    >().toEqualTypeOf<WrittenDigest | null>();
  });

  it("keeps a bounded number of waiting versions per tool", () => {
    expect(maxWaitingVersions).toBeGreaterThan(3);
  });
});
