import { MemoryTrustStore } from "@halonicjs/adapter-memory";
import type { Digest } from "@halonicjs/ports";
import { type TrustContentInput, trustContent, trustFingerprint } from "@halonicjs/workspace";

/** When every helper record was granted: the parity clock's start, so recordings never hold a real time. */
export const trustedWorkspaceGrantedAt = "2026-01-01T00:00:00.000Z";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/**
 * A memory trust store that already trusts one workspace, for tests in other
 * features and the parity harness: a run on the workspace passes the trust
 * gate, so its event log stays the same as the old repo's.
 *
 * The record holds the workspace's real trust content and `hfp1:`
 * fingerprint, built the way `TrustService` builds them. A test that changes
 * a connector after this call therefore sees the workspace as changed, as a
 * user would.
 *
 * @param location - the workspace's resolved real path, the record's key
 * @param input - the workspace's connectors and, as the service passes them, their command paths
 * @returns a store with that one record; add more with `grant`
 *
 * @example
 * const trust = await trustedWorkspace("/workspaces/acme", { connectors });
 * (await trust.get("/workspaces/acme"))?.fingerprint; // "hfp1:3b1f…"
 */
export async function trustedWorkspace(
  location: string,
  input: TrustContentInput,
): Promise<MemoryTrustStore> {
  const content = trustContent(input);
  const store = new MemoryTrustStore();
  await store.grant({
    location,
    fingerprint: await trustFingerprint(content, digest),
    content,
    grantedAt: trustedWorkspaceGrantedAt,
    appVersion: "0.1.0",
    pins: {},
    origin: "cli",
  });
  return store;
}
