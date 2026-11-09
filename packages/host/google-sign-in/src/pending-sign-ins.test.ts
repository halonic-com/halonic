import type { PendingSignInDetails } from "@halonicjs/google-setup";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fakeClient, testStart } from "./fake-google.test-helper.ts";
import { createPendingSignIns } from "./pending-sign-ins.ts";
import { createState } from "./state.ts";

const tenMinutes = 10 * 60 * 1000;

/** Fake details for a pending sign-in with a fresh `state`. */
function details(state = createState()): PendingSignInDetails {
  return {
    state,
    codeVerifier: "fake-verifier-0000000000000000000000000000",
    clientId: fakeClient.clientId,
    clientRef: fakeClient.clientRef,
    redirectUri: "http://127.0.0.1:8787/google/callback",
    scopes: ["email", "openid"],
    account: "account@example.com",
    services: [],
    authUrl: `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
  };
}

/** A holder whose clock the test moves. */
function holder() {
  let now = testStart;
  const pendingSignIns = createPendingSignIns({ now: () => new Date(now) });
  return {
    pendingSignIns,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

verifies("google-sign-in.pending-sign-ins", () => {
  it("gives a sign-in back once, by its state, with the account and start time", () => {
    const { pendingSignIns } = holder();
    const pending = details();
    pendingSignIns.start("gaccount_1", pending);

    expect(pendingSignIns.take(pending.state)).toEqual({
      ...pending,
      accountRef: "gaccount_1",
      startedAt: new Date(testStart),
    });
    expect(pendingSignIns.take(pending.state)).toBeUndefined();
    expect(pendingSignIns.authUrlFor("gaccount_1")).toBeUndefined();
  });

  it("keeps one sign-in per account: a second start replaces the first", () => {
    const { pendingSignIns } = holder();
    const first = details();
    const second = details();
    pendingSignIns.start("gaccount_1", first);
    pendingSignIns.start("gaccount_1", second);

    expect(pendingSignIns.authUrlFor("gaccount_1")).toBe(second.authUrl);
    expect(pendingSignIns.take(first.state)).toBeUndefined();
    expect(pendingSignIns.take(second.state)?.accountRef).toBe("gaccount_1");
  });

  it("finds the right account among several, and leaves the others in place", () => {
    const { pendingSignIns } = holder();
    const one = details();
    const two = details();
    pendingSignIns.start("gaccount_1", one);
    pendingSignIns.start("gaccount_2", two);

    expect(pendingSignIns.take(two.state)?.accountRef).toBe("gaccount_2");
    expect(pendingSignIns.authUrlFor("gaccount_1")).toBe(one.authUrl);
  });

  it("matches only the exact state, and leaves the sign-in in place otherwise", () => {
    const { pendingSignIns } = holder();
    const pending = details();
    pendingSignIns.start("gaccount_1", pending);
    const lastCharacter = pending.state.endsWith("A") ? "B" : "A";

    expect(pendingSignIns.take(`${pending.state.slice(0, -1)}${lastCharacter}`)).toBeUndefined();
    expect(pendingSignIns.take(pending.state.slice(0, -1))).toBeUndefined();
    expect(pendingSignIns.take("")).toBeUndefined();
    expect(pendingSignIns.authUrlFor("gaccount_1")).toBe(pending.authUrl);
  });

  it("expires a sign-in 10 minutes after its start, and removes it when taken", () => {
    const { pendingSignIns, advance } = holder();
    const early = details();
    const late = details();
    pendingSignIns.start("gaccount_1", early);
    pendingSignIns.start("gaccount_2", late);

    advance(tenMinutes - 1);
    expect(pendingSignIns.take(early.state)?.accountRef).toBe("gaccount_1");

    advance(1);
    expect(pendingSignIns.authUrlFor("gaccount_2")).toBeUndefined();
    expect(pendingSignIns.take(late.state)).toBeUndefined();
    // The expired match was removed: even with the clock turned back, it is gone.
    advance(-tenMinutes);
    expect(pendingSignIns.take(late.state)).toBeUndefined();
  });

  it("gives the same auth URL for Open again, and drops the sign-in on Cancel", () => {
    const { pendingSignIns } = holder();
    const pending = details();
    pendingSignIns.start("gaccount_1", pending);

    expect(pendingSignIns.authUrlFor("gaccount_1")).toBe(pending.authUrl);
    expect(pendingSignIns.authUrlFor("gaccount_1")).toBe(pending.authUrl);
    pendingSignIns.cancel("gaccount_1");
    pendingSignIns.cancel("gaccount_1");
    expect(pendingSignIns.take(pending.state)).toBeUndefined();
  });

  it("gives every server its own holder", () => {
    const pending = details();
    const first = holder().pendingSignIns;
    const second = holder().pendingSignIns;
    first.start("gaccount_1", pending);

    expect(second.take(pending.state)).toBeUndefined();
    expect(first.take(pending.state)?.accountRef).toBe("gaccount_1");
  });
});
