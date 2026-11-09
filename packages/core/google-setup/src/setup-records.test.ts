import { fixedClock, fixedIds } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { ApiOff, ServiceCheckOutcome } from "./check-result.ts";
import { type MemoryRecords, memoryRecords } from "./memory-records.test-helper.ts";
import type { SetupRoute } from "./setup-input.ts";
import type { SetupRecord } from "./setup-record.ts";
import { SetupRecordError } from "./setup-record-error.ts";
import { setupRecords } from "./setup-records.ts";

// Fake values only. The secret has no GOCSPX- prefix, so the leak check
// doesn't match it; the client ID check refuses it either way.
const fakeClientId = "1234-abc123.apps.googleusercontent.com";
const fakeSecret = "fake-client-secret-one";

const route: SetupRoute = { app: "own", runsOn: "this-computer" };

const ledgerEnableUrl =
  "https://console.cloud.google.com/apis/library/ledger.googleapis.com?project=halonic-x1";

/** An `apiOff` result as B3 makes it for an invented API the sheet lists. */
const ledgerApiOff: ApiOff = {
  kind: "apiOff",
  api: "ledger.googleapis.com",
  apiName: "Ledger API",
  project: "halonic-x1",
  enableUrl: ledgerEnableUrl,
};

/** An `apiOff` result for a real API whose name has a `/` in it. */
const pubSubApiOff: ApiOff = {
  kind: "apiOff",
  api: "pubsub.googleapis.com",
  apiName: "Cloud Pub/Sub API",
  project: "halonic-x1",
  enableUrl:
    "https://console.cloud.google.com/apis/library/pubsub.googleapis.com?project=halonic-x1",
};

/** One result of each of B3's six kinds, with every field each kind can have. */
const everyKind: readonly ServiceCheckOutcome[] = [
  { kind: "works" },
  { kind: "allowed" },
  {
    kind: "scopeNotGranted",
    missingScopes: ["https://www.googleapis.com/auth/ledger.readonly", "email"],
  },
  ledgerApiOff,
  pubSubApiOff,
  { kind: "apiOff", project: "123456789012" },
  { kind: "apiOff" },
  { kind: "checkFailed", status: 429, reason: "rateLimitExceeded" },
  { kind: "checkFailed", status: 502 },
  { kind: "unreachable" },
];

/** The type of one stored check result, as a reader of the record gets it. */
type StoredOutcome = SetupRecord["services"][string]["result"];

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
      result: ledgerApiOff,
    });

    const reopened = setupRecords({ records, clock: fixedClock(), ids: fixedIds() });
    expect(await reopened.read(accountRef)).toMatchObject({
      accountType: "personal",
      projectId: "halonic-x1",
      inProductionTickedAt: expect.any(String),
      clientId: fakeClientId,
      clientSecret: { clientRef: "gclient_1", savedAt: expect.any(String) },
      services: { ledger: { result: ledgerApiOff, checkedAt: expect.any(String) } },
    });

    await setups.update(accountRef, { kind: "in-production", ticked: false });
    await setups.update(accountRef, { kind: "project-id", projectId: null });
    expect(await setups.read(accountRef)).toMatchObject({
      inProductionTickedAt: null,
      projectId: null,
    });
  });

  it("keeps each of B3's check kinds with its fields and reads it back the same", async () => {
    const setups = newSetups();
    const { accountRef } = await setups.start({ route, accountType: "personal" });
    for (const [index, result] of everyKind.entries()) {
      await setups.update(accountRef, {
        kind: "service-checked",
        service: `service-${index}`,
        result,
      });
    }

    const reopened = setupRecords({ records, clock: fixedClock(), ids: fixedIds() });
    const stored = (await reopened.read(accountRef))?.services ?? {};
    expect(everyKind.map((_, index) => stored[`service-${index}`]?.result)).toEqual(everyKind);
    expect(stored["service-0"]?.checkedAt).toBe("2026-01-01T00:00:01.000Z");
    // The stored type and B3's type fit both ways, so the two can't drift apart.
    expectTypeOf<ServiceCheckOutcome>().toExtend<StoredOutcome>();
    expectTypeOf<StoredOutcome>().toExtend<ServiceCheckOutcome>();
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
        result: { kind: "works" },
      }),
    ];
    for (const call of refused) {
      expect((await errorOf(call)).reason).toBe("refused");
    }
    expect(records.log).toHaveLength(written);
  });

  it("refuses a check result with free text, another link or an extra key, and writes nothing", async () => {
    const setups = newSetups();
    const { accountRef } = await setups.start({ route, accountType: "personal" });
    const written = records.log.length;
    // Each holds the fake secret, so the test also shows no message repeats it.
    const refused = [
      { kind: "checkFailed", status: 403, reason: `The caller ${fakeSecret} has no access.` },
      { kind: "checkFailed", status: 403, message: fakeSecret },
      { kind: "scopeNotGranted", missingScopes: [`https://example.com/${fakeSecret}`] },
      { ...ledgerApiOff, enableUrl: `https://example.com/?token=${fakeSecret}` },
      { ...ledgerApiOff, apiName: `https://example.com/${fakeSecret}` },
      { ...ledgerApiOff, api: `${fakeSecret}.example.com` },
      { ...ledgerApiOff, project: fakeSecret },
      { kind: "works", token: fakeSecret },
    ];
    for (const result of refused) {
      const edit = { kind: "service-checked", service: "ledger", result } as const;
      const error = await errorOf(setups.update(accountRef, edit as never));
      expect(error.reason).toBe("refused");
      expect(error.message).not.toContain(fakeSecret);
    }
    expect(records.log).toHaveLength(written);
  });

  it("refuses an apiOff result that is only part there or a scope list that is empty", async () => {
    const setups = newSetups();
    const { accountRef } = await setups.start({ route, accountType: "personal" });
    const { enableUrl: _link, ...withoutLink } = ledgerApiOff;
    const refused: readonly ServiceCheckOutcome[] = [
      withoutLink,
      { kind: "apiOff", project: "halonic-x1", enableUrl: ledgerEnableUrl },
      { kind: "scopeNotGranted", missingScopes: [] },
      { kind: "checkFailed", status: 4290 },
    ];
    for (const result of refused) {
      const call = setups.update(accountRef, {
        kind: "service-checked",
        service: "ledger",
        result,
      });
      expect((await errorOf(call)).reason).toBe("refused");
    }
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

  it("reports a stored apiOff result with another host as damaged and leaves it out of the list", async () => {
    const setups = newSetups();
    const { accountRef } = await setups.start({ route, accountType: "personal" });
    await setups.start({ route, accountType: "workspace" });
    const otherHost = { ...ledgerApiOff, api: `${fakeSecret}.example.com` };
    records.log.push({
      at: "2026-01-01T00:01:00.000Z",
      collection: "_google_setups",
      id: accountRef,
      op: "update",
      values: {
        services: { ledger: { result: otherHost, checkedAt: "2026-01-01T00:01:00.000Z" } },
      },
    });

    const damaged = await errorOf(setups.read(accountRef));
    expect(damaged.reason).toBe("damaged");
    expect(damaged.message).not.toContain(fakeSecret);
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
