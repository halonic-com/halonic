import { fixedClock, fixedIds } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type MemoryRecords, memoryRecords } from "./memory-records.test-helper.ts";
import type { SetupRoute } from "./setup-input.ts";
import { SetupRecordError } from "./setup-record-error.ts";
import { setupRecords } from "./setup-records.ts";

const route: SetupRoute = { app: "own", runsOn: "this-computer" };

// Invented workspace keys: 32 hex characters, as the profile makes them.
const workspaceA = "0123456789abcdef0123456789abcdef";
const workspaceB = "fedcba9876543210fedcba9876543210";

function newSetups(records: MemoryRecords = memoryRecords()) {
  return setupRecords({ records, clock: fixedClock(), ids: fixedIds() });
}

verifies("google-setup.connector-link", () => {
  it("keeps the link in the record and reads it back after the store is opened again", async () => {
    const records = memoryRecords();
    const { accountRef } = await newSetups(records).start({
      route,
      accountType: "personal",
      connector: { workspace: workspaceA, id: "gmail" },
    });

    const reopened = await newSetups(records).read(accountRef);
    expect(reopened?.connector).toEqual({ workspace: workspaceA, id: "gmail" });
  });

  it("never gives workspace A's setup for workspace B's connector of the same id", async () => {
    const setups = newSetups();
    const { accountRef } = await setups.start({
      route,
      accountType: "personal",
      connector: { workspace: workspaceA, id: "gmail" },
    });

    expect((await setups.forConnector(workspaceA, "gmail"))?.accountRef).toBe(accountRef);
    expect(await setups.forConnector(workspaceB, "gmail")).toBeNull();
    expect(await setups.forConnector(workspaceA, "drive")).toBeNull();
  });

  it("gives the setup started last when a connector has more than one", async () => {
    const setups = newSetups();
    const connector = { workspace: workspaceA, id: "gmail" };
    await setups.start({ route, accountType: "personal", connector });
    const second = await setups.start({ route, accountType: "personal", connector });

    expect((await setups.forConnector(workspaceA, "gmail"))?.accountRef).toBe(second.accountRef);
  });

  it.each([
    ["a connector id with a slash", { workspace: workspaceA, id: "a/b" }],
    ["a connector id with dots", { workspace: workspaceA, id: ".." }],
    ["an upper-case connector id", { workspace: workspaceA, id: "Gmail" }],
    ["an empty connector id", { workspace: workspaceA, id: "" }],
    ["a connector id over 64 characters", { workspace: workspaceA, id: "a".repeat(65) }],
    ["a short workspace key", { workspace: "abc123", id: "gmail" }],
    ["an upper-case workspace key", { workspace: workspaceA.toUpperCase(), id: "gmail" }],
    ["a workspace key with a separator", { workspace: `${workspaceA.slice(1)}/`, id: "gmail" }],
  ])("refuses %s and writes nothing", async (_name, connector) => {
    const records = memoryRecords();
    const error = await newSetups(records)
      .start({ route, accountType: "personal", connector })
      .then(
        () => undefined,
        (thrown: unknown) => thrown,
      );

    expect(error).toBeInstanceOf(SetupRecordError);
    expect((error as SetupRecordError).reason).toBe("refused");
    expect(records.log).toEqual([]);
  });

  it("reads a stored record with no link as damaged and leaves it out of the list", async () => {
    const records = memoryRecords();
    const setups = newSetups(records);
    const { accountRef } = await setups.start({
      route,
      accountType: "personal",
      connector: { workspace: workspaceA, id: "gmail" },
    });
    const added = records.log[0];
    if (added?.values === null || added === undefined) {
      throw new Error("The start should have added a record.");
    }
    const { connector: _connector, ...withoutLink } = added.values;
    records.log[0] = { ...added, values: withoutLink };

    await expect(setups.read(accountRef)).rejects.toMatchObject({ reason: "damaged" });
    expect(await setups.list()).toEqual([]);
    expect(await setups.forConnector(workspaceA, "gmail")).toBeNull();
  });
});
