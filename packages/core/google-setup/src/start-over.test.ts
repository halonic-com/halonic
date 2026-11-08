import { fixedClock, fixedIds } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { clientSecretStore } from "./client-secret-store.ts";
import { type MemoryRecords, memoryRecords } from "./memory-records.test-helper.ts";
import { type MemoryTokens, memoryTokens } from "./memory-tokens.test-helper.ts";
import type { SetupRoute } from "./setup-input.ts";
import { SetupRecordError } from "./setup-record-error.ts";
import { setupRecords } from "./setup-records.ts";
import { startOver } from "./start-over.ts";

// Fake values only, without the GOCSPX- prefix the leak check looks for.
const fakeClientId = "1234-abc123.apps.googleusercontent.com";
const fakeSecret = "fake-client-secret-one";
const fakeStagedSecret = "fake-client-secret-two";
const fakeRefreshToken = "fake-refresh-token";

const route: SetupRoute = { app: "own", runsOn: "this-computer" };

let records: MemoryRecords;
let tokens: MemoryTokens;

function newStores() {
  records = memoryRecords();
  tokens = memoryTokens();
  const ids = fixedIds();
  const setups = setupRecords({ records, clock: fixedClock(), ids });
  const secrets = clientSecretStore(tokens, ids);
  return { setups, secrets, tokens };
}

type Stores = ReturnType<typeof newStores>;

/** A personal account signed in with its own app, as step 7 leaves it. */
async function signedInSetup({ setups, secrets }: Stores): Promise<string> {
  const { accountRef } = await setups.start({ route, accountType: "personal" });
  const clientRef = await secrets.saveClientSecret(fakeSecret);
  await setups.update(accountRef, { kind: "in-production", ticked: true });
  await setups.update(accountRef, { kind: "client-id", clientId: fakeClientId });
  await setups.update(accountRef, { kind: "client-secret-saved", clientRef });
  await setups.update(accountRef, { kind: "signed-in" });
  return accountRef;
}

/** The error a call throws, so a test can look at its reason. */
async function errorOf(call: Promise<unknown>): Promise<SetupRecordError> {
  const error = await call.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(SetupRecordError);
  return error as SetupRecordError;
}

verifies("google-setup.start-over", () => {
  it("removes the record, the refresh token and both secrets, and compacts the record away", async () => {
    const stores = newStores();
    const accountRef = await signedInSetup(stores);
    await stores.secrets.stageClientSecret("gclient_1", fakeStagedSecret);
    await tokens.set(`google-account-${accountRef}`, fakeRefreshToken);

    expect(await startOver(stores, accountRef)).toBe("removed");
    expect(tokens.values.size).toBe(0);
    expect(await stores.setups.read(accountRef)).toBeNull();
    expect(records.log.filter((change) => change.id === accountRef)).toEqual([]);
  });

  it("keeps a shared secret for the other account and leaves its record alone", async () => {
    const stores = newStores();
    const first = await signedInSetup(stores);
    const { accountRef: second } = await stores.setups.start({ route, accountType: "personal" });
    await stores.setups.shareClient(second, first);
    const firstBefore = await stores.setups.read(first);

    expect(await startOver(stores, second)).toBe("kept-for-other-accounts");
    expect(await stores.secrets.readClientSecret("gclient_1")).toBe(fakeSecret);
    expect(await stores.setups.read(first)).toEqual(firstBefore);
    expect(await stores.setups.read(second)).toBeNull();
  });

  it("says when no secret was saved yet, also for an account ref with no record", async () => {
    const stores = newStores();
    const { accountRef } = await stores.setups.start({ route, accountType: "workspace" });
    expect(await startOver(stores, accountRef)).toBe("none-saved");
    expect(await startOver(stores, "gaccount_9")).toBe("none-saved");
  });

  it("removes a damaged record but no client secret, since which one it used isn't known", async () => {
    const stores = newStores();
    const accountRef = await signedInSetup(stores);
    records.log.push({
      at: "2026-01-01T00:01:00.000Z",
      collection: "_google_setups",
      id: accountRef,
      op: "update",
      values: { clientId: fakeSecret },
    });

    expect(await startOver(stores, accountRef)).toBe("unknown");
    expect(await stores.setups.read(accountRef)).toBeNull();
    expect(await stores.secrets.readClientSecret("gclient_1")).toBe(fakeSecret);
  });
});

verifies("google-setup.shared-client", () => {
  it("copies the other app's client and marks steps 1 to 6 done, but not the sign-in", async () => {
    const stores = newStores();
    const first = await signedInSetup(stores);
    const { accountRef: second } = await stores.setups.start({ route, accountType: "personal" });

    const shared = await stores.setups.shareClient(second, first);
    expect(shared).toMatchObject({
      clientId: fakeClientId,
      clientSecret: { clientRef: "gclient_1" },
      inProductionTickedAt: expect.any(String),
      lastSignInAt: null,
    });
    expect(Object.keys(shared.stepsDone).sort()).toEqual(
      ["apis", "client", "consent", "credentials", "project", "scopes"].sort(),
    );
  });

  it("lists every account that uses a client", async () => {
    const stores = newStores();
    const first = await signedInSetup(stores);
    const { accountRef: second } = await stores.setups.start({ route, accountType: "personal" });
    await stores.setups.shareClient(second, first);
    await signedInSetup(stores);

    const users = await stores.setups.usingClient("gclient_1");
    expect(users.map((user) => user.accountRef)).toEqual([first, second]);
  });

  it("refuses to share a Workspace app, an app not signed in yet, or an account with itself", async () => {
    const stores = newStores();
    const working = await signedInSetup(stores);
    const { accountRef: notSignedIn } = await stores.setups.start({
      route,
      accountType: "personal",
    });
    const { accountRef: workspace } = await stores.setups.start({
      route,
      accountType: "workspace",
    });
    const written = records.log.length;

    for (const [accountRef, fromAccountRef] of [
      [workspace, working],
      [working, notSignedIn],
      [working, working],
    ] as const) {
      const error = await errorOf(stores.setups.shareClient(accountRef, fromAccountRef));
      expect(error.reason).toBe("cannot-share");
    }
    expect(records.log).toHaveLength(written);
  });

  it("refuses an account that already has its own client ID, client secret or sign-in", async () => {
    const stores = newStores();
    const working = await signedInSetup(stores);
    const startPersonal = async () =>
      (await stores.setups.start({ route, accountType: "personal" })).accountRef;

    const withClientId = await startPersonal();
    await stores.setups.update(withClientId, { kind: "client-id", clientId: fakeClientId });
    const withClientSecret = await startPersonal();
    const ownClientRef = await stores.secrets.saveClientSecret(fakeStagedSecret);
    await stores.setups.update(withClientSecret, {
      kind: "client-secret-saved",
      clientRef: ownClientRef,
    });
    const signedIn = await signedInSetup(stores);
    const written = records.log.length;

    for (const accountRef of [withClientId, withClientSecret, signedIn]) {
      const error = await errorOf(stores.setups.shareClient(accountRef, working));
      expect(error.reason).toBe("cannot-share");
    }
    expect(records.log).toHaveLength(written);
    // The account's own secret still has a record pointing to it, so Start over reaches it.
    expect(await stores.setups.usingClient(ownClientRef)).toHaveLength(1);
  });
});
