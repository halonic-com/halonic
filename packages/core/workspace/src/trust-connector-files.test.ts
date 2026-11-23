import type { Connector } from "@halonicjs/format";
import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { trustChanges } from "./trust-changes.ts";
import { trustContent } from "./trust-content.ts";
import { trustFingerprint } from "./trust-fingerprint.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const files: Connector = {
  version: 1,
  id: "files",
  transport: { stdio: { command: "node", args: ["./tools/server.js", "--port", "8080"] } },
  tools: { approve: [] },
};

const serverHash = `sha256:${"a".repeat(64)}`;
const changedHash = `sha256:${"b".repeat(64)}`;

function withFiles(hashes: Record<string, string>) {
  return trustContent({ connectors: [files], connectorFiles: new Map([["files", hashes]]) });
}

verifies("workspace.trust-connector-files", () => {
  it("keeps the fingerprint from before when a connector names no workspace file", async () => {
    // Worked out on main at 4f9b707, before files were covered: existing trust stays valid.
    const before = "hfp1:2afdcc4d298c7c47ce4f5687d20df64e72e48be7c91ce872d97b9af4db5e7713";

    expect(await trustFingerprint(trustContent({ connectors: [files] }), digest)).toBe(before);
    expect(await trustFingerprint(withFiles({}), digest)).toBe(before);
  });

  it("puts the hash of each named file in the connector's settings, sorted by path", () => {
    const content = withFiles({ "tools/server.js": serverHash, "tools/config.json": changedHash });

    const settings = content.connectors[0]?.settings ?? {};
    expect(settings["files"]).toEqual({
      "tools/config.json": changedHash,
      "tools/server.js": serverHash,
    });
    expect(Object.keys(settings["files"] as Record<string, string>)).toEqual([
      "tools/config.json",
      "tools/server.js",
    ]);
  });

  it("changes the fingerprint, and lists the connector's settings as changed, when a file changes", async () => {
    const trusted = withFiles({ "tools/server.js": serverHash });
    const current = withFiles({ "tools/server.js": changedHash });

    expect(await trustFingerprint(current, digest)).not.toBe(
      await trustFingerprint(trusted, digest),
    );
    const changes = trustChanges(trusted, current);
    expect(changes.changed.map((item) => [item.id, item.fields])).toEqual([
      ["files", ["settings"]],
    ]);
  });

  it("changes the fingerprint when a named file appears", async () => {
    expect(await trustFingerprint(withFiles({ "tools/server.js": serverHash }), digest)).not.toBe(
      await trustFingerprint(withFiles({}), digest),
    );
  });

  it("leaves the files of another connector out", () => {
    const content = trustContent({
      connectors: [files],
      connectorFiles: new Map([["other", { "tools/other.js": serverHash }]]),
    });

    expect(content.connectors[0]?.settings).not.toHaveProperty("files");
  });
});
