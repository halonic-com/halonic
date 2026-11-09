import type { Connector } from "@halonicjs/format";
import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { trustContent, trustFingerprint } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { trustedWorkspace, trustedWorkspaceGrantedAt } from "./trusted-workspace.ts";

/** SHA-256 from Node's Web Crypto, worked out apart from the helper. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

function program(args: string[]): Connector {
  return {
    version: 1,
    id: "files",
    transport: { stdio: { command: "node", args } },
    tools: { approve: [] },
  };
}

verifies("scenario.trusted-workspace", () => {
  it("trusts the workspace with its real trust content and fingerprint", async () => {
    const connectors = [program(["server.js"])];
    const store = await trustedWorkspace("/workspaces/acme", { connectors });

    const content = trustContent({ connectors });
    expect(await store.list()).toEqual([
      {
        location: "/workspaces/acme",
        fingerprint: await trustFingerprint(content, digest),
        content,
        grantedAt: trustedWorkspaceGrantedAt,
        appVersion: "0.1.0",
        pins: {},
        origin: "cli",
      },
    ]);
  });

  it("gives a changed connector a fingerprint the record doesn't hold", async () => {
    const store = await trustedWorkspace("/workspaces/acme", {
      connectors: [program(["server.js"])],
    });
    const changed = await trustFingerprint(
      trustContent({ connectors: [program(["server.js", "--all"])] }),
      digest,
    );
    expect((await store.get("/workspaces/acme"))?.fingerprint).not.toBe(changed);
  });

  it("puts the command paths into the fingerprint, as the service does", async () => {
    const connectors = [program(["server.js"])];
    const written = await trustedWorkspace("/workspaces/acme", { connectors });
    const resolved = await trustedWorkspace("/workspaces/acme", {
      connectors,
      commandPaths: new Map([["node", "/usr/local/bin/node"]]),
    });
    expect((await resolved.get("/workspaces/acme"))?.fingerprint).not.toBe(
      (await written.get("/workspaces/acme"))?.fingerprint,
    );
  });

  it("trusts that workspace only", async () => {
    const store = await trustedWorkspace("/workspaces/acme", { connectors: [] });
    expect(await store.get("/workspaces/zeta")).toBeNull();
  });
});
