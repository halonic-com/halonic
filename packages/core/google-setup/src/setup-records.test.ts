import { fixedClock, fixedIds } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type MemoryRecords, memoryRecords } from "./memory-records.test-helper.ts";
import type { SetupRoute } from "./setup-input.ts";
import { SetupRecordError } from "./setup-record-error.ts";
import { setupRecords } from "./setup-records.ts";

// Fake values only. The secret has no GOCSPX- prefix, so the leak check
// doesn't match it; the client ID check refuses it either way.
const fakeClientId = "1234-abc123.apps.googleusercontent.com";
const fakeSecret = "fake-client-secret-one";

const route: SetupRoute = { app: "own", runsOn: "this-computer" };

let records: MemoryRecords;

function newSetups() {
  records = memoryRecords();
  return setupRecords({ records, clock: fixedClock(), ids: fixedIds() });
}

/** The error a call throws, so a test can look at its reason and message. */
async function errorOf(call: Promise<unknown>): Promise<SetupRecordError> {
  const error = await call.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(SetupRecordError);
  return error as SetupRecordError;
}

verifies("google-setup.setup-record", () => {
  it("starts a record under a new account ref in _google_setups", async () => {
    const setups = newSetups();
    const setup = await setups.start({ route, accountType: "personal" });
    expect(setup).toEqual({
      accountRef: "gaccount_1",
      route,
      accountType: "personal",
      startedAt: "2026-01-01T00:00:00.000Z",
      projectId: null,
      stepsDone: {},
      inProductionTickedAt: null,
      clientId: null,
      clientSecret: null,
      signInStartedAt: null,
      lastSignInAt: null,
      services: {},
      refreshRefused: null,
    });
    expect(records.log).toMatchObject([
      { collection: "_google_setups", id: "gaccount_1", op: "add" },
    ]);
  });

  it("stamps each step with its own time, and reopening one drops only its tick", async () => {
    const setups = newSetups();
    const { accountRef } = await setups.start({ route, accountType: "workspace" });
    await setups.update(accountRef, { kind: "step-done", step: "project" });
    const both = await setups.update(accountRef, { kind: "step-done", step: "apis" });
    expect(both.stepsDone).toEqual({
      project: "2026-01-01T00:00:01.000Z",
      apis: "2026-01-01T00:00:02.000Z",
    });
    const reopened = await setups.update(accountRef, { kind: "step-reopened", step: "apis" });
    expect(reopened.stepsDone).toEqual({ project: "2026-01-01T00:00:01.000Z" });
  });

  it("saves the setup values each edit changes, and they read back the same", async () => {
    const setups = newSetups();
    const { accountRef } = await setups.start({ route, accountType: "workspace" });
    await setups.update(accountRef, { kind: "account-type", accountType: "personal" });
    await setups.update(accountRef, { kind: "project-id", projectId: "halonic-x1" });
    await setups.update(accountRef, { kind: "in-production", ticked: true });
    await setups.update(accountRef, { kind: "client-id", clientId: fakeClientId });
    await setups.update(accountRef, { kind: "client-secret-saved", clientRef: "gclient_1" });
    await setups.update(accountRef, {
      kind: "service-checked",
      service: "ledger",
      scopeGranted: true,
      check: "api-off",
    });

    const reopened = setupRecords({ records, clock: fixedClock(), ids: fixedIds() });
    expect(await reopened.read(accountRef)).toMatchObject({
      accountType: "personal",
      projectId: "halonic-x1",
      inProductionTickedAt: expect.any(String),
      clientId: fakeClientId,
      clientSecret: { clientRef: "gclient_1", savedAt: expect.any(String) },
      services: { ledger: { scopeGranted: true, check: "api-off", checkedAt: expect.any(String) } },
    });

    await setups.update(accountRef, { kind: "in-production", ticked: false });
    await setups.update(accountRef, { kind: "project-id", projectId: null });
    expect(await setups.read(accountRef)).toMatchObject({
      inProductionTickedAt: null,
      projectId: null,
    });
  });

  it("keeps the last sign-in when one comes back, and only clears the wait when one is dropped", async () => {
    const setups = newSetups();
    const { accountRef } = await setups.start({ route, accountType: "personal" });
    const waiting = await setups.update(accountRef, { kind: "sign-in-started" });
    expect(waiting.signInStartedAt).toBe("2026-01-01T00:00:01.000Z");

    const signedIn = await setups.update(accountRef, { kind: "signed-in" });
    expect(signedIn).toMatchObject({
      signInStartedAt: null,
      lastSignInAt: "2026-01-01T00:00:02.000Z",
    });

    await setups.update(accountRef, { kind: "sign-in-started" });
    const dropped = await setups.update(accountRef, { kind: "sign-in-dropped" });
    expect(dropped).toMatchObject({
      signInStartedAt: null,
      lastSignInAt: "2026-01-01T00:00:02.000Z",
    });
  });

  it("lists every record and reads an unknown account ref as null", async () => {
    const setups = newSetups();
    await setups.start({ route, accountType: "personal" });
    await setups.start({ route, accountType: "workspace" });
    expect((await setups.list()).map((setup) => setup.accountRef)).toEqual([
      "gaccount_1",
      "gaccount_2",
    ]);
    expect(await setups.read("gaccount_9")).toBeNull();
  });

  it("refuses an edit to an account ref with no record", async () => {
    const setups = newSetups();
    const missing = await errorOf(setups.update("gaccount_9", { kind: "signed-in" }));
    expect(missing.reason).toBe("not-found");
    const badRef = await errorOf(setups.read("Gaccount-1"));
    expect(badRef.reason).toBe("not-found");
  });
});

verifies("google-setup.setup-record-holds-no-secret", () => {
  it("holds exactly the listed values, so there is no place for a secret or a token", async () => {
    const setup = await newSetups().start({ route, accountType: "personal" });
    expect(Object.keys(setup).sort()).toEqual([
      "accountRef",
      "accountType",
      "clientId",
      "clientSecret",
      "inProductionTickedAt",
      "lastSignInAt",
      "projectId",
      "refreshRefused",
      "route",
      "services",
      "signInStartedAt",
      "startedAt",
      "stepsDone",
    ]);
  });

  it("refuses a client secret as the client ID, writes nothing and doesn't repeat it", async () => {
    const setups = newSetups();
    const { accountRef } = await setups.start({ route, accountType: "personal" });
    const written = records.log.length;
    for (const clientId of [fakeSecret, `GOCSPX-${fakeSecret}`]) {
      const error = await errorOf(setups.update(accountRef, { kind: "client-id", clientId }));
      expect(error.reason).toBe("refused");
      expect(error.message).not.toContain(fakeSecret);
    }
    expect(records.log).toHaveLength(written);
  });

  it("refuses refs, project IDs and service ids that break their rules", async () => {
    const setups = newSetups();
    const { accountRef } = await setups.start({ route, accountType: "personal" });
    const written = records.log.length;
    const refused = [
      setups.update(accountRef, { kind: "client-secret-saved", clientRef: "gclient_1_staged" }),
      setups.update(accountRef, { kind: "client-secret-saved", clientRef: fakeSecret }),
      setups.update(accountRef, { kind: "project-id", projectId: "Halonic X" }),
      setups.update(accountRef, {
        kind: "service-checked",
        service: "__proto__",
        scopeGranted: true,
        check: "works",
      }),
    ];
    for (const call of refused) {
      expect((await errorOf(call)).reason).toBe("refused");
    }
    expect(records.log).toHaveLength(written);
  });

  it("reports a stored record with an extra value as damaged and leaves it out of the list", async () => {
    const setups = newSetups();
    const { accountRef } = await setups.start({ route, accountType: "personal" });
    await setups.start({ route, accountType: "workspace" });
    records.log.push({
      at: "2026-01-01T00:01:00.000Z",
      collection: "_google_setups",
      id: accountRef,
      op: "update",
      values: { refreshToken: fakeSecret },
    });

    const damaged = await errorOf(setups.read(accountRef));
    expect(damaged.reason).toBe("damaged");
    expect(damaged.message).not.toContain(fakeSecret);
    expect((await errorOf(setups.update(accountRef, { kind: "signed-in" }))).reason).toBe(
      "damaged",
    );
    expect((await setups.list()).map((setup) => setup.accountRef)).toEqual(["gaccount_2"]);
  });
});

describe("setup records and other collections", () => {
  it("reads and writes no other collection", async () => {
    const setups = newSetups();
    records.log.push({
      at: "2026-01-01T00:00:00.000Z",
      collection: "leads",
      id: "gaccount_1",
      op: "add",
      values: {},
    });
    await setups.start({ route, accountType: "personal" });
    expect(await setups.list()).toHaveLength(1);
    expect(records.log.filter((change) => change.collection !== "_google_setups")).toHaveLength(1);
  });
});
