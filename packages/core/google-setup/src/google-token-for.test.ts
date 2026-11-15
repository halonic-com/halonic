import { fixedClock, fixedIds } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { googleTokenFor } from "./google-token-for.ts";
import { type MemoryRecords, memoryRecords } from "./memory-records.test-helper.ts";
import type { SetupRoute } from "./setup-input.ts";
import { setupRecords } from "./setup-records.ts";
import { refreshTokenName } from "./store-names.ts";

const route: SetupRoute = { app: "own", runsOn: "this-computer" };

// Invented workspace keys: 32 hex characters, as the profile makes them.
const workspaceA = "0123456789abcdef0123456789abcdef";
const workspaceB = "fedcba9876543210fedcba9876543210";

function newSetups(records: MemoryRecords = memoryRecords()) {
  return setupRecords({ records, clock: fixedClock(), ids: fixedIds() });
}

function startFor(setups: ReturnType<typeof newSetups>, workspace: string, id = "gmail") {
  return setups.start({ route, accountType: "personal", connector: { workspace, id } });
}

verifies("google-setup.connector-token", () => {
  describe("googleTokenFor", () => {
    it("gives the account ref and the token name of the connector's setup", async () => {
      const setups = newSetups();
      const { accountRef } = await startFor(setups, workspaceA);

      expect(await googleTokenFor(setups, { workspace: workspaceA, id: "gmail" })).toEqual({
        accountRef,
        tokenName: refreshTokenName(accountRef),
      });
    });

    it("gives null for a connector without a setup", async () => {
      const setups = newSetups();
      await startFor(setups, workspaceA);

      expect(await googleTokenFor(setups, { workspace: workspaceA, id: "drive" })).toBeNull();
    });

    it("never reaches workspace A's account from workspace B's connector, or the reverse", async () => {
      const setups = newSetups();
      const a = await startFor(setups, workspaceA);
      expect(await googleTokenFor(setups, { workspace: workspaceB, id: "gmail" })).toBeNull();

      const b = await startFor(setups, workspaceB);
      const forA = await googleTokenFor(setups, { workspace: workspaceA, id: "gmail" });
      const forB = await googleTokenFor(setups, { workspace: workspaceB, id: "gmail" });
      expect(forA?.accountRef).toBe(a.accountRef);
      expect(forB?.accountRef).toBe(b.accountRef);
      expect(forA?.tokenName).not.toBe(forB?.tokenName);
    });

    it("gives the setup started last when a connector has two", async () => {
      const setups = newSetups();
      await startFor(setups, workspaceA);
      const second = await startFor(setups, workspaceA);

      const found = await googleTokenFor(setups, { workspace: workspaceA, id: "gmail" });
      expect(found?.accountRef).toBe(second.accountRef);
    });

    it("gives null, and does not throw, for a stored record with no link", async () => {
      const records = memoryRecords();
      const setups = newSetups(records);
      await startFor(setups, workspaceA);
      const added = records.log[0];
      if (added?.values === null || added === undefined) {
        throw new Error("The start should have added a record.");
      }
      const { connector: _connector, ...withoutLink } = added.values;
      records.log[0] = { ...added, values: withoutLink };

      expect(await googleTokenFor(setups, { workspace: workspaceA, id: "gmail" })).toBeNull();
    });

    it("gives null for a link that breaks the name rules", async () => {
      const setups = newSetups();
      await startFor(setups, workspaceA);

      expect(await googleTokenFor(setups, { workspace: workspaceA, id: "../gmail" })).toBeNull();
      expect(await googleTokenFor(setups, { workspace: "abc", id: "gmail" })).toBeNull();
    });
  });
});
