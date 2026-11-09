import type { TrustRecord, TrustStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** One empty trust store under test, and a way to damage what it holds. */
export interface TrustStoreHarness {
  store: TrustStore;
  /**
   * Makes the stored record for `location` unreadable, the way a damaged
   * or hand-edited file would be. The suite only damages records it granted.
   */
  damage(location: string): Promise<void>;
}

/** Creates an empty store under test. */
export type MakeTrustStore = () => Promise<TrustStoreHarness>;

/** A full record for `location`; `fingerprint` tells two versions apart. */
export function trustRecord(location: string, fingerprint = "hfp1:aa"): TrustRecord {
  return {
    location,
    fingerprint,
    content: {
      programs: [{ connector: "mail", command: "npx", args: ["-y", "@acme/mail-mcp"] }],
      http: [
        { connector: "docs", url: "https://bücher.acme.test/mcp", headers: ["Authorization"] },
      ],
    },
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
}

/** The contract every {@link TrustStore} adapter passes. The port only stores; it decides nothing. */
export function trustStoreContract(name: string, make: MakeTrustStore): void {
  verifies("contracts.trust-store", () => {
    describe(`TrustStore contract: ${name}`, () => {
      storageCases(make);
      locationCases(make);
      damageCases(make);
    });
  });
}

function storageCases(make: MakeTrustStore): void {
  it("starts empty, and gives back every field of a granted record", async () => {
    const { store } = await make();
    expect(await store.get("/workspaces/acme")).toBeNull();
    expect(await store.list()).toEqual([]);

    await store.grant(trustRecord("/workspaces/acme"));
    expect(await store.get("/workspaces/acme")).toEqual(trustRecord("/workspaces/acme"));
    expect(await store.list()).toEqual([trustRecord("/workspaces/acme")]);
  });

  it("replaces the record when the same location is granted again", async () => {
    const { store } = await make();
    await store.grant(trustRecord("/workspaces/acme", "hfp1:old"));
    await store.grant({ ...trustRecord("/workspaces/acme", "hfp1:new"), origin: "cli", pins: {} });
    expect(await store.get("/workspaces/acme")).toEqual({
      ...trustRecord("/workspaces/acme", "hfp1:new"),
      origin: "cli",
      pins: {},
    });
    expect(await store.list()).toHaveLength(1);
  });

  it("revokes a record, and revoking one that isn't there is not an error", async () => {
    const { store } = await make();
    await store.grant(trustRecord("/workspaces/acme"));
    await store.revoke("/workspaces/acme");
    expect(await store.get("/workspaces/acme")).toBeNull();
    await store.revoke("/workspaces/acme");
    await store.revoke("/workspaces/never");
    expect(await store.list()).toEqual([]);
  });

  it("keeps what was granted, whatever the caller does with its objects later", async () => {
    const { store } = await make();
    const granted = trustRecord("/workspaces/acme");
    await store.grant(granted);
    granted.fingerprint = "hfp1:changed";
    (granted.pins["mail"] as { version: string }).version = "9.9.9";

    const read = await store.get("/workspaces/acme");
    expect(read).toEqual(trustRecord("/workspaces/acme"));
    if (read !== null) read.origin = "cli";
    expect(await store.get("/workspaces/acme")).toEqual(trustRecord("/workspaces/acme"));
  });
}

function locationCases(make: MakeTrustStore): void {
  it("keeps one record per location, and lists them sorted by location", async () => {
    const { store } = await make();
    // Neither the order granted nor its reverse is sorted.
    const granted = ["/workspaces/acme", "/workspaces/zeta", "/hubs/shared", "/workspaces/beta"];
    for (const location of granted) {
      await store.grant(trustRecord(location, `hfp1:${location}`));
    }
    await store.revoke("/workspaces/zeta");

    expect((await store.list()).map((record) => record.location)).toEqual([
      "/hubs/shared",
      "/workspaces/acme",
      "/workspaces/beta",
    ]);
    expect(await store.get("/workspaces/acme")).toEqual(
      trustRecord("/workspaces/acme", "hfp1:/workspaces/acme"),
    );
  });

  it("compares locations exactly as given", async () => {
    const { store } = await make();
    await store.grant(trustRecord("/workspaces/acme"));
    // TrustService resolves the real path first; the store must not guess.
    for (const other of ["/workspaces/acme/", "/Workspaces/acme", "/workspaces/./acme"]) {
      expect(await store.get(other), other).toBeNull();
    }
    await store.revoke("/workspaces/acme/");
    expect(await store.get("/workspaces/acme")).not.toBeNull();
  });
}

function damageCases(make: MakeTrustStore): void {
  it("throws, naming the location, when a record can't be read", async () => {
    const { store, damage } = await make();
    await store.grant(trustRecord("/workspaces/acme"));
    await store.grant(trustRecord("/workspaces/zeta"));
    await damage("/workspaces/acme");

    // Never null: the service must not ask again as if the source were new.
    await expect(store.get("/workspaces/acme")).rejects.toThrow("/workspaces/acme");
    await expect(store.list()).rejects.toThrow("/workspaces/acme");
    expect(await store.get("/workspaces/zeta")).toEqual(trustRecord("/workspaces/zeta"));
  });

  it("revokes a record that can't be read, so the user can recover", async () => {
    const { store, damage } = await make();
    await store.grant(trustRecord("/workspaces/acme"));
    await damage("/workspaces/acme");
    await store.revoke("/workspaces/acme");
    expect(await store.get("/workspaces/acme")).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  it("replaces a record that can't be read when it is granted again", async () => {
    const { store, damage } = await make();
    await store.grant(trustRecord("/workspaces/acme"));
    await damage("/workspaces/acme");
    await store.grant(trustRecord("/workspaces/acme", "hfp1:again"));
    expect(await store.get("/workspaces/acme")).toEqual(
      trustRecord("/workspaces/acme", "hfp1:again"),
    );
  });
}
