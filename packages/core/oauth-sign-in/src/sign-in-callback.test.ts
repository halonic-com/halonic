import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { pendingSignInLifetimeMs } from "./pending-sign-in.ts";
import { fakePending, testPendingSignIns } from "./pending-sign-ins.test-helper.ts";
import { readSignInCallback } from "./sign-in-callback.ts";

const fakeCode = "fake-authorisation-code";
const start = Date.UTC(2026, 10, 8, 12, 0, 0);

/** A server with one pending sign-in for `account_1`, and a clock the test moves. */
function serverWithPendingSignIn() {
  let now = start;
  const pendingSignIns = testPendingSignIns(() => new Date(now));
  pendingSignIns.start("account_1", fakePending);
  return {
    pendingSignIns,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

const callback = (query: string) => new URLSearchParams(query);

verifies("oauth-sign-in.callback-state", () => {
  it("returns the code and the pending sign-in when state matches, and removes it", () => {
    const { pendingSignIns } = serverWithPendingSignIn();

    const result = readSignInCallback(
      callback(`code=${fakeCode}&state=${fakePending.state}`),
      pendingSignIns,
    );

    expect(result).toEqual({
      kind: "code",
      code: fakeCode,
      pending: { ...fakePending, accountRef: "account_1", startedAt: new Date(start) },
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

  it("gives linkNoLongerValid once the sign-in is 10 minutes old, and accepts it just before", () => {
    const old = serverWithPendingSignIn();
    old.advance(pendingSignInLifetimeMs);
    const fresh = serverWithPendingSignIn();
    fresh.advance(pendingSignInLifetimeMs - 1);
    const query = callback(`code=${fakeCode}&state=${fakePending.state}`);

    expect(readSignInCallback(query, old.pendingSignIns)).toEqual({ kind: "linkNoLongerValid" });
    expect(readSignInCallback(query, fresh.pendingSignIns).kind).toBe("code");
  });
});

verifies("oauth-sign-in.callback-errors", () => {
  describe("with a matching state", () => {
    const providerNames = { org_internal: "outsideOrganisation" } as const;

    it.each([
      ["access_denied", { kind: "cancelled", accountRef: "account_1" }],
      ["org_internal", { kind: "outsideOrganisation", accountRef: "account_1" }],
      [
        "server_error",
        { kind: "providerError", accountRef: "account_1", errorCode: "server_error" },
      ],
    ])("maps error=%s", (error, expected) => {
      const { pendingSignIns } = serverWithPendingSignIn();

      expect(
        readSignInCallback(
          callback(`error=${error}&state=${fakePending.state}`),
          pendingSignIns,
          providerNames,
        ),
      ).toEqual(expected);
      expect(pendingSignIns.size()).toBe(0);
    });

    it("gives a code the provider didn't name as providerError", () => {
      const { pendingSignIns } = serverWithPendingSignIn();

      expect(
        readSignInCallback(
          callback(`error=org_internal&state=${fakePending.state}`),
          pendingSignIns,
        ),
      ).toEqual({ kind: "providerError", accountRef: "account_1", errorCode: "org_internal" });
    });

    it("keeps access_denied as cancelled even when the provider's table names it differently", () => {
      const { pendingSignIns } = serverWithPendingSignIn();

      const result = readSignInCallback(
        callback(`error=access_denied&state=${fakePending.state}`),
        pendingSignIns,
        { access_denied: "adminBlocked" },
      );

      expect(result.kind).toBe("cancelled");
    });

    it("never treats a name inherited from Object as a named error", () => {
      const { pendingSignIns } = serverWithPendingSignIn();

      const result = readSignInCallback(
        callback(`error=constructor&state=${fakePending.state}`),
        pendingSignIns,
        providerNames,
      );

      expect(result).toEqual({
        kind: "providerError",
        accountRef: "account_1",
        errorCode: "constructor",
      });
    });

    it("lets an error win over a code", () => {
      const { pendingSignIns } = serverWithPendingSignIn();

      const result = readSignInCallback(
        callback(`error=access_denied&code=${fakeCode}&state=${fakePending.state}`),
        pendingSignIns,
      );

      expect(result).toEqual({ kind: "cancelled", accountRef: "account_1" });
    });

    it("gives incompleteCallback when there is neither an error nor a code", () => {
      const { pendingSignIns } = serverWithPendingSignIn();

      expect(readSignInCallback(callback(`state=${fakePending.state}`), pendingSignIns)).toEqual({
        kind: "incompleteCallback",
        accountRef: "account_1",
      });
    });

    it("never keeps error_description, nor an error value that isn't a plain code", () => {
      const { pendingSignIns } = serverWithPendingSignIn();
      const query = callback(
        `error=${encodeURIComponent(`bad ${fakeCode}`)}&error_description=${fakeCode}&state=${fakePending.state}`,
      );

      const result = readSignInCallback(query, pendingSignIns);

      expect(result).toEqual({
        kind: "providerError",
        accountRef: "account_1",
        errorCode: "unrecognised",
      });
      expect(JSON.stringify(result)).not.toContain(fakeCode);
    });
  });
});
