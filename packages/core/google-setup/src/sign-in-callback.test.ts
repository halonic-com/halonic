import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { pendingSignInLifetimeMs } from "./pending-sign-in.ts";
import { fakePending, testPendingSignIns } from "./pending-sign-ins.test-helper.ts";
import { readSignInCallback } from "./sign-in-callback.ts";

const fakeCode = "fake-authorisation-code";
const start = Date.UTC(2026, 10, 8, 12, 0, 0);

/** A server with one pending sign-in for `gaccount_1`, and a clock the test moves. */
function serverWithPendingSignIn() {
  let now = start;
  const pendingSignIns = testPendingSignIns(() => new Date(now));
  pendingSignIns.start("gaccount_1", fakePending);
  return {
    pendingSignIns,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

const callback = (query: string) => new URLSearchParams(query);

verifies("google-setup.sign-in.callback-state", () => {
  it("returns the code and the pending sign-in when state matches, and removes it", () => {
    const { pendingSignIns } = serverWithPendingSignIn();

    const result = readSignInCallback(
      callback(`code=${fakeCode}&state=${fakePending.state}`),
      pendingSignIns,
    );

    expect(result).toEqual({
      kind: "code",
      code: fakeCode,
      pending: { ...fakePending, accountRef: "gaccount_1", startedAt: new Date(start) },
    });
    expect(pendingSignIns.size()).toBe(0);
  });

  it("gives linkNoLongerValid for a second callback with the same state", () => {
    const { pendingSignIns } = serverWithPendingSignIn();
    const query = callback(`code=${fakeCode}&state=${fakePending.state}`);

    readSignInCallback(query, pendingSignIns);

    expect(readSignInCallback(query, pendingSignIns)).toEqual({ kind: "linkNoLongerValid" });
  });

  it.each([
    ["a wrong state", `code=${fakeCode}&state=other-state`],
    ["no state", `code=${fakeCode}`],
    ["an empty state", `code=${fakeCode}&state=`],
    ["a forged cancel with a wrong state", "error=access_denied&state=other-state"],
    ["a forged cancel without state", "error=access_denied"],
  ])("gives linkNoLongerValid for %s and leaves the pending sign-in in place", (_name, query) => {
    const { pendingSignIns } = serverWithPendingSignIn();

    expect(readSignInCallback(callback(query), pendingSignIns)).toEqual({
      kind: "linkNoLongerValid",
    });
    expect(pendingSignIns.size()).toBe(1);
  });

  it("gives linkNoLongerValid once the sign-in is 10 minutes old", () => {
    const { pendingSignIns, advance } = serverWithPendingSignIn();
    advance(pendingSignInLifetimeMs);

    expect(
      readSignInCallback(callback(`code=${fakeCode}&state=${fakePending.state}`), pendingSignIns),
    ).toEqual({ kind: "linkNoLongerValid" });
  });

  it("still accepts the callback just before 10 minutes", () => {
    const { pendingSignIns, advance } = serverWithPendingSignIn();
    advance(pendingSignInLifetimeMs - 1);

    const result = readSignInCallback(
      callback(`code=${fakeCode}&state=${fakePending.state}`),
      pendingSignIns,
    );

    expect(result.kind).toBe("code");
  });
});

verifies("google-setup.sign-in.callback-errors", () => {
  describe("with a matching state", () => {
    it.each([
      ["access_denied", { kind: "cancelled", accountRef: "gaccount_1" }],
      ["admin_policy_enforced", { kind: "adminBlocked", accountRef: "gaccount_1" }],
      ["org_internal", { kind: "outsideOrganisation", accountRef: "gaccount_1" }],
      [
        "server_error",
        { kind: "googleError", accountRef: "gaccount_1", errorCode: "server_error" },
      ],
    ])("maps error=%s", (error, expected) => {
      const { pendingSignIns } = serverWithPendingSignIn();

      expect(
        readSignInCallback(callback(`error=${error}&state=${fakePending.state}`), pendingSignIns),
      ).toEqual(expected);
      expect(pendingSignIns.size()).toBe(0);
    });

    it("lets an error win over a code", () => {
      const { pendingSignIns } = serverWithPendingSignIn();

      const result = readSignInCallback(
        callback(`error=access_denied&code=${fakeCode}&state=${fakePending.state}`),
        pendingSignIns,
      );

      expect(result).toEqual({ kind: "cancelled", accountRef: "gaccount_1" });
    });

    it("gives incompleteCallback when there is neither an error nor a code", () => {
      const { pendingSignIns } = serverWithPendingSignIn();

      expect(readSignInCallback(callback(`state=${fakePending.state}`), pendingSignIns)).toEqual({
        kind: "incompleteCallback",
        accountRef: "gaccount_1",
      });
    });
  });
});

verifies("google-setup.sign-in.no-secret-echo", () => {
  it("never keeps error_description, nor an error value that isn't a plain code", () => {
    const { pendingSignIns } = serverWithPendingSignIn();
    const query = callback(
      `error=${encodeURIComponent(`bad ${fakeCode}`)}&error_description=${fakeCode}&state=${fakePending.state}`,
    );

    const result = readSignInCallback(query, pendingSignIns);

    expect(result).toEqual({
      kind: "googleError",
      accountRef: "gaccount_1",
      errorCode: "unrecognised",
    });
    expect(JSON.stringify(result)).not.toContain(fakeCode);
  });

  it("returns the verifier and the code only in the code result", () => {
    const { pendingSignIns } = serverWithPendingSignIn();

    const cancelled = readSignInCallback(
      callback(`error=access_denied&code=${fakeCode}&state=${fakePending.state}`),
      pendingSignIns,
    );

    expect(JSON.stringify(cancelled)).not.toContain(fakeCode);
    expect(JSON.stringify(cancelled)).not.toContain(fakePending.codeVerifier);
    expect(JSON.stringify(cancelled)).not.toContain(fakePending.state);
  });
});

verifies("google-setup.sign-in.open-again", () => {
  it("gives the same auth URL while the sign-in is valid, and keeps it pending", () => {
    const { pendingSignIns, advance } = serverWithPendingSignIn();
    advance(5 * 60 * 1000);

    expect(pendingSignIns.authUrlFor("gaccount_1")).toBe(fakePending.authUrl);
    expect(pendingSignIns.size()).toBe(1);
  });

  it("lets the first tab's callback finish after Open again", () => {
    const { pendingSignIns } = serverWithPendingSignIn();
    pendingSignIns.authUrlFor("gaccount_1");

    const result = readSignInCallback(
      callback(`code=${fakeCode}&state=${fakePending.state}`),
      pendingSignIns,
    );

    expect(result.kind).toBe("code");
  });

  it("gives no URL once the sign-in has expired, or for an account without one", () => {
    const { pendingSignIns, advance } = serverWithPendingSignIn();
    advance(pendingSignInLifetimeMs);

    expect(pendingSignIns.authUrlFor("gaccount_1")).toBeUndefined();
    expect(pendingSignIns.authUrlFor("gaccount_2")).toBeUndefined();
  });

  it("gives linkNoLongerValid for the callback of a cancelled sign-in", () => {
    const { pendingSignIns } = serverWithPendingSignIn();
    pendingSignIns.cancel("gaccount_1");

    expect(pendingSignIns.authUrlFor("gaccount_1")).toBeUndefined();
    expect(
      readSignInCallback(callback(`code=${fakeCode}&state=${fakePending.state}`), pendingSignIns),
    ).toEqual({ kind: "linkNoLongerValid" });
  });

  it("leaves other accounts' sign-ins in place on Cancel", () => {
    const { pendingSignIns } = serverWithPendingSignIn();
    pendingSignIns.start("gaccount_2", { ...fakePending, state: "fake-state-other" });

    pendingSignIns.cancel("gaccount_1");

    expect(pendingSignIns.authUrlFor("gaccount_2")).toBe(fakePending.authUrl);
  });
});
