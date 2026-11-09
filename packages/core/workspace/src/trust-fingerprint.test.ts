import type { Connector } from "@halonicjs/format";
import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type TrustContent, trustContent } from "./trust-content.ts";
import { trustFingerprint } from "./trust-fingerprint.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
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

function fingerprintOf(connectors: Connector[]): Promise<string> {
  return trustFingerprint(trustContent({ connectors }), digest);
}

verifies("workspace.trust-fingerprint", () => {
  it("is hfp1: and the SHA-256 of the content's length, a line break and its canonical JSON", async () => {
    // sha256("16\n" + '{"connectors":[]}'), worked out on its own.
    expect(await trustFingerprint({ connectors: [] }, digest)).toBe(
      "hfp1:108e472376d29b48d14f5f668bca2b827ca6400da7ad618b7c04f72dc42c19ae",
    );
  });

  it("is the same for the same content in any key order", async () => {
    const content: TrustContent = trustContent({ connectors: [program(["server.js"])] });
    const [connector] = content.connectors;
    const reordered = {
      connectors: [Object.fromEntries(Object.entries(connector ?? {}).reverse())],
    };
    expect(await trustFingerprint(reordered as TrustContent, digest)).toBe(
      await trustFingerprint(content, digest),
    );
  });

  it('gives ["a b"] and ["a", "b"] different fingerprints', async () => {
    expect(await fingerprintOf([program(["a b"])])).not.toBe(
      await fingerprintOf([program(["a", "b"])]),
    );
  });

  it("changes when the content changes", async () => {
    expect(await fingerprintOf([program(["server.js"])])).not.toBe(
      await fingerprintOf([program(["server.js", "--allow-all"])]),
    );
  });
});
