import type { Connector } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { fingerprintAttacks, fingerprintControls } from "./trust-fingerprint.ts";
import { type MakeTrustStore, trustRecord } from "./trust-store.ts";

/**
 * What Halonic saves when a person trusts a workspace's connectors: their
 * trust content and its fingerprint. The real ones are `trustContent` and
 * `trustFingerprint` in `core/workspace`.
 */
export type TrustConnectors = (
  connectors: readonly Connector[],
) => Promise<{ content: unknown; fingerprint: string }>;

const location = "/workspaces/acme";

/**
 * The fingerprint attack cases run through a `TrustStore`: a record
 * granted for the workspace before an attacker edit never matches the
 * workspace after it, and a harmless rewrite still matches. The store keeps
 * the fingerprint and the content exactly, so "what changed" can be shown.
 */
export function trustStoreAttackContract(
  name: string,
  make: MakeTrustStore,
  trust: TrustConnectors,
): void {
  /** Grants the workspace as it was, and reads the record back. */
  async function granted(before: readonly Connector[]) {
    const { store } = await make();
    const saved = await trust(before);
    await store.grant({ ...trustRecord(location), ...saved });
    const read = await store.get(location);
    expect(read?.content).toEqual(saved.content);
    expect(read?.fingerprint).toBe(saved.fingerprint);
    return read?.fingerprint;
  }

  verifies("contracts.trust-store-attacks", () => {
    describe(`TrustStore attack contract: ${name}`, () => {
      for (const [attack, edited] of Object.entries(fingerprintAttacks)) {
        it(`no longer matches after an attacker ${attack} (${edited.item})`, async () => {
          const stored = await granted(edited.before);
          expect(stored).not.toBe((await trust(edited.after)).fingerprint);
        });
      }
      for (const [control, edited] of Object.entries(fingerprintControls)) {
        it(`still matches when the workspace ${control}`, async () => {
          const stored = await granted(edited.before);
          expect(stored).toBe((await trust(edited.after)).fingerprint);
        });
      }
    });
  });
}
