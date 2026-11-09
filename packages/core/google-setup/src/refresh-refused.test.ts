import { fixedClock, fixedIds } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { connectorState, savedConnectorState } from "./connector-state.ts";
import { type MemoryRecords, memoryRecords } from "./memory-records.test-helper.ts";
import { readRefreshAnswer } from "./refresh-answer.ts";
import { mayRefresh } from "./refresh-refused.ts";
import type { SetupRoute } from "./setup-input.ts";
import { SetupRecordError } from "./setup-record-error.ts";
import { type SetupRecords, setupRecords } from "./setup-records.ts";

// Fake values only; none is a real token or secret.
const fakeRefreshToken = "fake-refresh-token";
const fakeSecret = "fake-client-secret-one";

const route: SetupRoute = { app: "own", runsOn: "this-computer" };
const signInRefused = { kind: "signInRefused" } as const;
const clientRefused = { kind: "clientRefused" } as const;

interface Fixture {
  readonly records: MemoryRecords;
  readonly setups: SetupRecords;
  /** How many times `append` was called, to check one write per refusal. */
  readonly appendCalls: () => number;
}

function fixture(): Fixture {
  const records = memoryRecords();
  let calls = 0;
  const counted: MemoryRecords = {
    ...records,
    append: (changes) => {
      calls += 1;
      return records.append(changes);
    },
  };
  const setups = setupRecords({ records: counted, clock: fixedClock(), ids: fixedIds() });
  return { records, setups, appendCalls: () => calls };
}

/** A personal account signed in with the client secret under `clientRef`. */
async function signedIn(setups: SetupRecords, clientRef: string): Promise<string> {
  const { accountRef } = await setups.start({ route, accountType: "personal" });
  await setups.update(accountRef, { kind: "client-secret-saved", clientRef });
  await setups.update(accountRef, { kind: "signed-in" });
  return accountRef;
}

/** The saved reason of each account, in the order given. */
async function reasons(setups: SetupRecords, accountRefs: readonly string[]) {
  const read = await Promise.all(accountRefs.map((accountRef) => setups.read(accountRef)));
  return read.map((record) => record?.refreshRefused?.reason ?? null);
}

verifies("google-setup.refresh-refused", () => {
  it("marks only the account for invalid_grant, blocks its refresh, and a new sign-in clears it", async () => {
    const { setups } = fixture();
    const first = await signedIn(setups, "gclient_1");
    const second = await signedIn(setups, "gclient_1");

    const marked = await setups.refreshRefused(first, signInRefused);

    expect(marked.map((record) => record.accountRef)).toEqual([first]);
    expect(await reasons(setups, [first, second])).toEqual(["sign-in", null]);
    expect(mayRefresh((await setups.read(first)) ?? { refreshRefused: null })).toBe(false);

    const again = await setups.update(first, { kind: "signed-in" });
    expect(again.refreshRefused).toBeNull();
    expect(mayRefresh(again)).toBe(true);
  });

  it("blocks anything but null, so a value that slipped past the schema can't refresh", () => {
    expect(mayRefresh({ refreshRefused: null })).toBe(true);
    expect(
      mayRefresh({ refreshRefused: { reason: "client", at: "2026-01-01T00:00:00.000Z" } }),
    ).toBe(false);
    expect(mayRefresh({} as { refreshRefused: null })).toBe(false);
  });

  it("reads a record written before the field as not refused, and fails a malformed one", async () => {
    const { records, setups } = fixture();
    const { accountRef } = await setups.start({ route, accountType: "personal" });
    const added = records.log[0];
    if (added?.values == null) {
      throw new Error("expected the record's add");
    }
    const { refreshRefused: _left, ...older } = added.values;
    records.log[0] = { ...added, values: older };

    expect((await setups.read(accountRef))?.refreshRefused).toBeNull();

    for (const malformed of [
      "sign-in",
      { reason: "later", at: "2026-01-01T00:00:00.000Z" },
      { reason: "sign-in", at: "yesterday" },
      { reason: "sign-in", at: "2026-01-01T00:00:00.000Z", note: "extra" },
    ]) {
      records.log.splice(1, records.log.length, {
        at: "2026-01-01T00:00:01.000Z",
        collection: "_google_setups",
        id: accountRef,
        op: "update",
        values: { refreshRefused: malformed },
      });
      const error = await setups.read(accountRef).catch((thrown: unknown) => thrown);
      expect(error).toBeInstanceOf(SetupRecordError);
      expect(await setups.list()).toEqual([]);
    }
  });

  it("never moves an account to a reason that needs less, and keeps the time it was first refused", async () => {
    const { setups, appendCalls } = fixture();
    const account = await signedIn(setups, "gclient_1");
    const [first] = await setups.refreshRefused(account, clientRefused);
    const [gone] = await setups.refreshRefused(account, clientRefused);
    const callsBefore = appendCalls();
    const [later] = await setups.refreshRefused(account, clientRefused);

    expect(first?.refreshRefused?.reason).toBe("client");
    expect(gone?.refreshRefused?.reason).toBe("client-gone");
    expect(later?.refreshRefused).toEqual(gone?.refreshRefused);
    // Nothing changed, so nothing was written.
    expect(appendCalls()).toBe(callsBefore);

    const signInAccount = await signedIn(setups, "gclient_2");
    await setups.refreshRefused(signInAccount, signInRefused);
    const [stillSignIn] = await setups.refreshRefused(signInAccount, clientRefused);
    expect(stillSignIn?.refreshRefused?.reason).toBe("sign-in");
  });

  it("writes no token, secret or text from Google, even when Google echoes them", async () => {
    const { records, setups } = fixture();
    const account = await signedIn(setups, "gclient_1");
    const answers = [
      { error: "invalid_grant", error_description: `token ${fakeRefreshToken}` },
      { error: "invalid_client", error_description: `secret ${fakeSecret}` },
    ];

    for (const json of answers) {
      const refusal = readRefreshAnswer({ status: 400, json });
      if (refusal.kind !== "signInRefused" && refusal.kind !== "clientRefused") {
        throw new Error(`expected a refusal, got ${refusal.kind}`);
      }
      await setups.refreshRefused(account, refusal);
    }

    const stored = JSON.stringify(records.log);
    expect(stored).not.toContain(fakeRefreshToken);
    expect(stored).not.toContain(fakeSecret);
    expect(stored).not.toContain("error_description");
  });
});

verifies("google-setup.shared-client-refused", () => {
  it("marks every account on the client for invalid_client, in one write, and no other", async () => {
    const { setups, appendCalls } = fixture();
    const first = await signedIn(setups, "gclient_1");
    const second = await signedIn(setups, "gclient_1");
    const other = await signedIn(setups, "gclient_2");
    const callsBefore = appendCalls();

    const marked = await setups.refreshRefused(second, clientRefused);

    expect(appendCalls() - callsBefore).toBe(1);
    expect(marked.map((record) => record.accountRef)).toEqual([first, second]);
    expect(await reasons(setups, [first, second, other])).toEqual(["client", "client", null]);
  });

  it("clears only a client refusal when a new secret is accepted, never a refused sign-in", async () => {
    const { setups, appendCalls } = fixture();
    const signInAccount = await signedIn(setups, "gclient_1");
    const clientAccount = await signedIn(setups, "gclient_1");
    await setups.refreshRefused(signInAccount, signInRefused);
    // Fails on the client, but the first account keeps its stricter sign-in refusal.
    await setups.refreshRefused(clientAccount, clientRefused);
    const callsBefore = appendCalls();

    const cleared = await setups.clientSecretAccepted("gclient_1");

    expect(appendCalls() - callsBefore).toBe(1);
    expect(cleared.map((record) => record.accountRef)).toEqual([clientAccount]);
    expect(await reasons(setups, [signInAccount, clientAccount])).toEqual(["sign-in", null]);
  });

  it("marks the client gone when a new secret is refused too; only each account's own sign-in clears it", async () => {
    const { setups } = fixture();
    const first = await signedIn(setups, "gclient_1");
    const second = await signedIn(setups, "gclient_1");
    await setups.refreshRefused(first, clientRefused);
    const beforeCheck = await setups.read(first);
    if (beforeCheck === null) {
      throw new Error("expected the record");
    }

    // The staged-secret check is refused with invalid_client too.
    const now = new Date("2026-01-01T01:00:00.000Z");
    expect(connectorState(beforeCheck, clientRefused, now)).toEqual({
      kind: "needs-new-secret",
      clientGone: true,
      reopenAt: ["client", "credentials", "sign-in"],
    });
    await setups.refreshRefused(first, clientRefused);
    expect(await reasons(setups, [first, second])).toEqual(["client-gone", "client-gone"]);

    expect(await setups.clientSecretAccepted("gclient_1")).toEqual([]);
    expect(await reasons(setups, [first, second])).toEqual(["client-gone", "client-gone"]);

    await setups.update(first, { kind: "signed-in" });
    expect(await reasons(setups, [first, second])).toEqual([null, "client-gone"]);
  });

  it("marks the client gone when the check runs through an account that holds a refused sign-in", async () => {
    const { setups } = fixture();
    const signInAccount = await signedIn(setups, "gclient_1");
    const clientAccount = await signedIn(setups, "gclient_1");
    await setups.refreshRefused(signInAccount, signInRefused);
    await setups.refreshRefused(clientAccount, clientRefused);
    expect(await reasons(setups, [signInAccount, clientAccount])).toEqual(["sign-in", "client"]);

    // The staged-secret check ran through the account whose own refusal is the sign-in.
    const marked = await setups.refreshRefused(signInAccount, clientRefused);

    expect(await reasons(setups, [signInAccount, clientAccount])).toEqual([
      "client-gone",
      "client-gone",
    ]);
    // The host gives each returned account its badge from the record.
    const gone = { kind: "needs-new-secret", clientGone: true };
    expect(marked.map((record) => savedConnectorState(record))).toMatchObject([gone, gone]);
  });
});

describe("savedConnectorState", () => {
  it("gives the badge back from the record after a restart", async () => {
    const { setups } = fixture();
    const account = await signedIn(setups, "gclient_1");
    const fresh = await setups.read(account);
    expect(fresh === null ? undefined : savedConnectorState(fresh)).toBeNull();

    const [client] = await setups.refreshRefused(account, clientRefused);
    expect(client === undefined ? undefined : savedConnectorState(client)).toEqual({
      kind: "needs-new-secret",
      clientGone: false,
      reopenAt: ["credentials"],
    });

    const [gone] = await setups.refreshRefused(account, clientRefused);
    expect(gone === undefined ? undefined : savedConnectorState(gone)).toMatchObject({
      clientGone: true,
    });
  });
});
