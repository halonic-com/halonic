import type { Digest } from "@halonicjs/ports";
import { fingerprintCoverageContract } from "@halonicjs/testing-contracts";
import { trustContent } from "./trust-content.ts";
import { trustFingerprint } from "./trust-fingerprint.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

// Julian's attack cases (HAL-684): every attacker edit changes the
// fingerprint, and no harmless rewrite of the same files does.
fingerprintCoverageContract("core/workspace", (connectors) =>
  trustFingerprint(trustContent({ connectors }), digest),
);
