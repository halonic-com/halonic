import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { testRandomBytes } from "./fixed-random.test-helper.ts";
import type { PendingSignInDetails } from "./pending-sign-in.ts";
import { createPendingSignIns } from "./pending-sign-ins.ts";
import { createState } from "./state.ts";

/** 2026-11-08T12:00:00Z, the time the tests' clocks start at. */
const testStart = Date.UTC(2026, 10, 8, 12, 0, 0);
const tenMinutes = 10 * 60 * 1000;

/** Fake details for a pending sign-in with a fresh `state`. */
function details(state = createState(testRandomBytes)): PendingSignInDetails {
  return {
    state,
    codeVerifier: "fake-verifier-0000000000000000000000000000",
    clientId: "fake-client.apps.example.com",
    clientRef: "client_fake1",
    redirectUri: "http://127.0.0.1:8787/oauth/callback",
    scopes: ["profile"],
    authUrl: `https://auth.example.com/authorize?state=${state}`,
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

verifies("oauth-sign-in.pending-sign-ins", () => {
  it("gives a sign-in back once, by its state, with the account and start time", () => {
    const { pendingSignIns } = holder();
    const pending = details();
    pendingSignIns.start("account_1", pending);

    expect(pendingSignIns.take(pending.state)).toEqual({
      ...pending,
      accountRef: "account_1",
      startedAt: new Date(testStart),
    });
    expect(pendingSignIns.take(pending.state)).toBeUndefined();
    expect(pendingSignIns.authUrlFor("account_1")).toBeUndefined();
  });

  it("keeps one sign-in per account: a second start replaces the first", () => {
    const { pendingSignIns } = holder();
    const first = details();
    const second = details();
    pendingSignIns.start("account_1", first);
    pendingSignIns.start("account_1", second);

    expect(pendingSignIns.authUrlFor("account_1")).toBe(second.authUrl);
    expect(pendingSignIns.take(first.state)).toBeUndefined();
    expect(pendingSignIns.take(second.state)?.accountRef).toBe("account_1");
  });

  it("finds the right account among several, and leaves the others in place", () => {
    const { pendingSignIns } = holder();
    const one = details();
    const two = details();
    pendingSignIns.start("account_1", one);
    pendingSignIns.start("account_2", two);

    expect(pendingSignIns.take(two.state)?.accountRef).toBe("account_2");
    expect(pendingSignIns.authUrlFor("account_1")).toBe(one.authUrl);
  });

  it("matches only the exact state, and leaves the sign-in in place otherwise", () => {
    const { pendingSignIns } = holder();
    const pending = details();
    pendingSignIns.start("account_1", pending);
    const lastCharacter = pending.state.endsWith("A") ? "B" : "A";

    expect(pendingSignIns.take(`${pending.state.slice(0, -1)}${lastCharacter}`)).toBeUndefined();
    expect(pendingSignIns.take(pending.state.slice(0, -1))).toBeUndefined();
    expect(pendingSignIns.take("")).toBeUndefined();
    expect(pendingSignIns.authUrlFor("account_1")).toBe(pending.authUrl);
  });

  it("expires a sign-in 10 minutes after its start, and removes it when taken", () => {
    const { pendingSignIns, advance } = holder();
    const early = details();
    const late = details();
    pendingSignIns.start("account_1", early);
    pendingSignIns.start("account_2", late);

    advance(tenMinutes - 1);
    expect(pendingSignIns.take(early.state)?.accountRef).toBe("account_1");

    advance(1);
    expect(pendingSignIns.authUrlFor("account_2")).toBeUndefined();
    expect(pendingSignIns.take(late.state)).toBeUndefined();
    // The expired match was removed: even with the clock turned back, it is gone.
    advance(-tenMinutes);
    expect(pendingSignIns.take(late.state)).toBeUndefined();
  });

  it("gives the same auth URL for Open again, and drops the sign-in on Cancel", () => {
    const { pendingSignIns } = holder();
    const pending = details();
    pendingSignIns.start("account_1", pending);

    expect(pendingSignIns.authUrlFor("account_1")).toBe(pending.authUrl);
    expect(pendingSignIns.authUrlFor("account_1")).toBe(pending.authUrl);
    pendingSignIns.cancel("account_1");
    pendingSignIns.cancel("account_1");
    expect(pendingSignIns.take(pending.state)).toBeUndefined();
  });

  it("gives every server its own holder", () => {
    const pending = details();
    const first = holder().pendingSignIns;
    const second = holder().pendingSignIns;
    first.start("account_1", pending);

    expect(second.take(pending.state)).toBeUndefined();
    expect(first.take(pending.state)?.accountRef).toBe("account_1");
  });
});
