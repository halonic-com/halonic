import type { Connector } from "@halonicjs/format";
import type { TrustGrant, TrustStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  type FingerprintCase,
  fingerprintAttacks,
  fingerprintControls,
} from "./trust-fingerprint.ts";
import type { MakeTrustStore } from "./trust-store.ts";

/** The workspace a trust check is about, as `TrustService` in `core/app` takes it. */
export interface TrustCheckSubject {
  readonly location: string;
  readonly connectors: readonly Connector[];
  readonly commandPaths: ReadonlyMap<string, string>;
}

/**
 * The part of `TrustService` the suite uses. The real one is in `core/app`;
 * a suite builds it over the store under test.
 */
export interface TrustChecker {
  check(subject: TrustCheckSubject): Promise<{
    readonly status: string;
    readonly fingerprint: string;
    readonly grant?: TrustGrant;
  }>;
  grant(
    subject: TrustCheckSubject,
    shownFingerprint: string,
    origin: "cli",
  ): Promise<{ ok: boolean }>;
}

/** Builds the trust check over `store`. */
export type MakeTrustChecker = (store: TrustStore) => TrustChecker;

const location = "/workspaces/acme";
const commandPaths = new Map([
  ["node", "/usr/bin/node"],
  ["bash", "/usr/bin/bash"],
]);

/**
 * The fingerprint attack cases run through the trust check over a
 * `TrustStore`: after a person trusted the workspace, any attacker edit
 * gives no grant (the connector gets `trust: null`, so its program never
 * starts) and writes nothing to the record, and a harmless rewrite still
 * gives the person's grant.
 */
export function trustServiceAttackContract(
  name: string,
  make: MakeTrustStore,
  checker: MakeTrustChecker,
): void {
  /** What the launcher hands a connector: the grant, or `null` when Halonic asks again. */
  async function trustFor(service: TrustChecker, connectors: readonly Connector[]) {
    const check = await service.check({ location, connectors, commandPaths });
    return check.status === "trusted" ? (check.grant ?? null) : null;
  }

  /** A store with the workspace trusted as a person would: with the fingerprint the check showed. */
  async function trusted({ before }: FingerprintCase) {
    const { store } = await make();
    const service = checker(store);
    const subject = { location, connectors: before, commandPaths };
    const shown = await service.check(subject);
    expect((await service.grant(subject, shown.fingerprint, "cli")).ok).toBe(true);
    const record = await store.get(location);
    expect(record?.fingerprint).toBe(shown.fingerprint);
    return { store, service, record, grant: { location, fingerprint: shown.fingerprint } };
  }

  verifies("contracts.trust-service-attacks", () => {
    describe(`Trust check attack contract: ${name}`, () => {
      for (const [attack, edited] of Object.entries(fingerprintAttacks)) {
        it(`asks again and writes nothing after an attacker ${attack} (${edited.item})`, async () => {
          const { store, service, record, grant } = await trusted(edited);

          expect(await trustFor(service, edited.after)).toBeNull();
          expect(await store.get(location)).toEqual(record);
          expect(await trustFor(service, edited.before)).toEqual(grant);
        });
      }
      for (const [control, edited] of Object.entries(fingerprintControls)) {
        it(`still trusts the workspace when it ${control}`, async () => {
          const { store, service, record, grant } = await trusted(edited);

          expect(await trustFor(service, edited.after)).toEqual(grant);
          expect(await store.get(location)).toEqual(record);
        });
      }
      it("asks for a workspace nobody trusted, and writes nothing", async () => {
        const { store } = await make();
        const { before } = fingerprintAttacks["adds NODE_OPTIONS to a program"];

        expect(await trustFor(checker(store), before)).toBeNull();
        expect(await store.list()).toEqual([]);
      });
    });
  });
}
