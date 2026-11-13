import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { signInName } from "./example-sheet.ts";
import { createSignInRig, type SignInRig } from "./sign-in-rig.ts";

const second = 1000;
const minute = 60 * second;

/** The sheet after an update that drops the sign-in and its client secret. */
function removeSignIn(sheet: Record<string, unknown>): void {
  sheet["signIns"] = {};
  sheet["secrets"] = {};
}

/** A rig that is signed in. */
async function signedInRig(): Promise<SignInRig> {
  const rig = createSignInRig();
  const { outcome } = await rig.signIn();
  expect(outcome).toMatchObject({ kind: "signedIn" });
  return rig;
}

function refreshes(rig: SignInRig) {
  return rig.server.tokenRequests("refresh_token");
}

/** The bearer token a request to the resource server carried. */
function bearer(rig: SignInRig, index: number): string | undefined {
  return rig.server.requests.filter((request) => request.url.host === rig.server.apiHost)[index]
    ?.headers["authorization"];
}

verifies("sign-in.token-attacks", () => {
  describe("attack case T11: an update that changes what the user approved", () => {
    const changes: [string, Record<string, unknown>][] = [
      ["the token URL", { tokenUrl: "https://auth.example.com/other/token" }],
      ["the authorize URL", { authorizeUrl: "https://auth.example.com/other/authorize" }],
      ["the revoke URL", { revokeUrl: "https://auth.example.com/other/revoke" }],
      ["the scopes", { scopes: [{ scope: "projects.write", reason: "Changes your projects." }] }],
      ["the client ID", { clientId: "another-client" }],
      ["the client authentication", { clientAuth: "basic" }],
      [
        "the access hosts",
        { access: { hosts: ["api.example.com", "cdn.example.com"], as: "bearer" } },
      ],
      [
        "the placement",
        { access: { hosts: ["api.example.com"], as: "header", header: "x-token" } },
      ],
    ];

    it.each(changes)(
      "stops using the grant when %s changes, and sends the provider nothing",
      async (_name, change) => {
        const rig = await signedInRig();
        rig.editSignIn(change);

        await expect(rig.signIns.tokens.access(signInName)).rejects.toMatchObject({
          name: "SignInNeededError",
        });

        expect(refreshes(rig)).toEqual([]);
        expect(rig.server.revokeRequests()).toEqual([]);
      },
    );

    it("stops using the grant when a setting changes the client ID", async () => {
      const rig = await signedInRig();
      rig.changeSettings({ clientId: "another-client" });
      await expect(rig.signIns.tokens.access(signInName)).rejects.toMatchObject({
        name: "SignInNeededError",
      });
      expect(refreshes(rig)).toEqual([]);
    });

    it("stops using the grant when the sheet no longer has the sign-in", async () => {
      const rig = await signedInRig();
      rig.editSheet(removeSignIn);
      await expect(rig.signIns.tokens.access(signInName)).rejects.toMatchObject({
        name: "SignInNeededError",
      });
      expect(refreshes(rig)).toEqual([]);
    });

    it("revokes the old grant at the URL the user approved when the user signs out, and removes it", async () => {
      const rig = await signedInRig();
      const refreshToken = rig.server.ledger.grants[0]?.currentRefreshToken ?? "";
      rig.editSignIn({ revokeUrl: "https://evil.example/revoke", clientId: "another-client" });
      rig.server.handle("evil.example", () => new Response("collected"));

      const result = await rig.signIns.signOut(signInName);

      expect(result).toEqual({ kind: "signedOut", revoke: "revoked" });
      expect(rig.server.requests.filter((request) => request.url.host === "evil.example")).toEqual(
        [],
      );
      expect(rig.server.revokeRequests()).toHaveLength(1);
      expect(rig.server.revokeRequests()[0]?.form["client_id"]).toBe(rig.server.clientId);
      expect(rig.server.ledger.grants[0]?.revoked).toBe(true);
      expect(
        rig.server
          .requestsCarrying(refreshToken)
          .every((request) => request.url.host === "auth.example.com"),
      ).toBe(true);
      expect(rig.store.size).toBe(0);
    });

    // Open gap, tracked as finding 2 of the attack-test task. `it.fails` turns red when the code closes it,
    // so this test is then changed to `it`.
    it.fails("revokes and drops the old grant when it is found changed, before the user signs in again", async () => {
      const rig = await signedInRig();
      rig.editSignIn({ scopes: [{ scope: "projects.write", reason: "Changes your projects." }] });

      await rig.signIns.tokens.access(signInName).catch(() => undefined);

      expect(rig.server.ledger.grants[0]?.revoked).toBe(true);
      expect(rig.store.size).toBe(0);
    });
  });

  // Open gap, tracked as finding 2 of the attack-test task (second part).
  describe("attack case T11: signing in again over a changed sign-in", () => {
    it.fails("revokes the old grant at the URL the user approved", async () => {
      const rig = await signedInRig();
      rig.editSignIn({ scopes: [{ scope: "projects.write", reason: "Changes your projects." }] });

      expect((await rig.signIn()).outcome).toMatchObject({ kind: "signedIn" });

      expect(rig.server.ledger.grants[0]?.revoked).toBe(true);
      expect(rig.server.ledger.grants[1]?.revoked).toBe(false);
    });
  });

  describe("attack case T13: many requests at once, and a late 401", () => {
    it("makes one refresh for eight requests with no token, and one more when it expired", async () => {
      const rig = await signedInRig();
      const release = rig.server.holdTokenAnswers();
      const first = Array.from({ length: 8 }, () => rig.api());
      await Promise.resolve();
      release();
      expect((await Promise.all(first)).map((response) => response.status)).toEqual(
        Array(8).fill(200),
      );
      expect(refreshes(rig)).toHaveLength(1);

      rig.advance(3600 * second - 30 * second);
      const again = rig.server.holdTokenAnswers();
      const later = Array.from({ length: 8 }, () => rig.api());
      await Promise.resolve();
      again();
      await Promise.all(later);
      expect(refreshes(rig)).toHaveLength(2);
    });

    it("makes no refresh for a late 401 of a token that was already replaced", async () => {
      const rig = await signedInRig();
      await rig.api();
      const oldToken = bearer(rig, 0);
      let arrived: () => void = () => undefined;
      const lateRequestArrived = new Promise<void>((resolve) => {
        arrived = resolve;
      });
      let answerLate: () => void = () => undefined;
      const lateAnswer = new Promise<void>((resolve) => {
        answerLate = resolve;
      });
      rig.server.handle(rig.server.apiHost, async (request) => {
        if (request.headers["authorization"] !== oldToken) return undefined;
        arrived();
        await lateAnswer;
        return new Response("late", { status: 401 });
      });

      const late = rig.api();
      await lateRequestArrived;
      rig.advance(3600 * second - 30 * second);
      expect((await rig.api()).status).toBe(200);
      expect(refreshes(rig)).toHaveLength(2);
      // The new token is old enough for a 401 to count against it, so a late 401 that did would force a refresh.
      rig.advance(31 * second);
      answerLate();
      expect((await late).status).toBe(401);
      expect((await rig.api()).status).toBe(200);

      expect(refreshes(rig)).toHaveLength(2);
    });
  });

  describe("attack case T15: forced refreshes", () => {
    /** An API that answers 401 to every token, as one does that fails for another reason. */
    function alwaysUnauthorized(rig: SignInRig) {
      rig.server.handle(rig.server.apiHost, () => new Response("no", { status: 401 }));
    }

    it("makes no refresh for a 401 within 30 seconds of the token's issue, however often it comes", async () => {
      const rig = await signedInRig();
      alwaysUnauthorized(rig);
      for (let i = 0; i < 20; i++) {
        expect((await rig.api()).status).toBe(401);
        rig.advance(1 * second);
      }
      expect(refreshes(rig)).toHaveLength(1);
    });

    it("makes one forced refresh after 30 seconds, and none for the new token's 401", async () => {
      const rig = await signedInRig();
      alwaysUnauthorized(rig);
      await rig.api();
      rig.advance(31 * second);
      await rig.api();
      for (let i = 0; i < 10; i++) {
        expect((await rig.api()).status).toBe(401);
      }
      expect(refreshes(rig)).toHaveLength(2);
    });

    it("never says the user must sign in again for a 401, and keeps the grant", async () => {
      const rig = await signedInRig();
      alwaysUnauthorized(rig);
      for (let i = 0; i < 4; i++) {
        rig.advance(31 * second);
        const response = await rig.api();
        expect(response.status).toBe(401);
      }
      expect(rig.store.size).toBe(1);
      expect(rig.server.ledger.grants[0]?.revoked).toBe(false);
    });

    it("says so only when the provider answers invalid_grant to a refresh, and then drops the grant", async () => {
      const rig = await signedInRig();
      for (const grant of rig.server.ledger.grants) grant.revoked = true;
      await expect(rig.api()).rejects.toMatchObject({ code: "sign-in-needed" });
      expect(rig.store.size).toBe(0);
    });
  });

  describe("attack case T17: an update that changes where the grant is revoked", () => {
    it("revokes at the approved URL with the approved client authentication, and nowhere else", async () => {
      const rig = await signedInRig();
      rig.editSignIn({ revokeUrl: "https://evil.example/revoke", clientAuth: "basic" });
      rig.server.handle("evil.example", () => new Response("collected"));

      await rig.signIns.signOut(signInName);

      const [revoke] = rig.server.revokeRequests();
      expect(rig.server.revokeRequests()).toHaveLength(1);
      expect(revoke?.form["client_secret"]).toBe(rig.server.clientSecret);
      expect(revoke?.headers["authorization"]).toBeUndefined();
      expect(rig.server.requests.filter((request) => request.url.host === "evil.example")).toEqual(
        [],
      );
    });

    it("revokes when the sheet has since dropped the sign-in, and when it never had a revoke URL", async () => {
      const rig = await signedInRig();
      rig.editSheet(removeSignIn);
      expect(await rig.signIns.signOut(signInName)).toEqual({
        kind: "signedOut",
        revoke: "revoked",
      });

      const withoutRevoke = createSignInRig({ signIn: { revokeUrl: undefined } });
      await withoutRevoke.signIn();
      expect(await withoutRevoke.signIns.signOut(signInName)).toEqual({
        kind: "signedOut",
        revoke: "noRevokeUrl",
      });
      expect(withoutRevoke.server.revokeRequests()).toEqual([]);
      expect(withoutRevoke.store.size).toBe(0);
    });
  });

  describe("attack case T18: a sheet edited without an update", () => {
    it("stops using the grant at the next request, and a request never reaches the provider", async () => {
      const rig = await signedInRig();
      await rig.api();
      const sent = rig.server.requests.length;
      rig.advance(3600 * second);
      rig.editSignIn({
        access: {
          hosts: ["api.example.com", "cdn.example.com"],
          as: "bearer",
        },
      });

      await expect(rig.api()).rejects.toMatchObject({ code: "sign-in-needed" });

      expect(rig.server.requests).toHaveLength(sent);
    });

    it("reads the grant as changed on every load, so an edit that is put back makes it current again and a second edit makes it stale again", async () => {
      const rig = await signedInRig();
      const approved = async () => {
        const found = await rig.signIns.lookUp(signInName);
        if (found.kind !== "approvable") throw new Error("the sign-in isn't approvable");
        return (await rig.grants.load("example", signInName, found.signIn)).kind;
      };
      expect(await approved()).toBe("current");
      rig.editSignIn({ scopes: [] });
      expect(await approved()).toBe("stale");
      rig.editSignIn({ scopes: [{ scope: "projects.read", reason: "Reads your projects." }] });
      expect(await approved()).toBe("current");
    });

    it("drops a saved grant that was edited in the store, and one that is not a grant", async () => {
      const rig = await signedInRig();
      const [name, text] = [...rig.store.entries()][0] ?? ["", ""];
      const saved = JSON.parse(text) as { approved: Record<string, unknown> };
      saved.approved["tokenUrl"] = "https://evil.example/token";
      rig.store.set(name, JSON.stringify(saved));
      await expect(rig.signIns.tokens.access(signInName)).rejects.toMatchObject({
        name: "SignInNeededError",
      });
      expect(rig.store.size).toBe(0);

      rig.store.set(name, "not json");
      await expect(rig.signIns.tokens.access(signInName)).rejects.toMatchObject({
        name: "SignInNeededError",
      });
      expect(rig.store.size).toBe(0);
      expect(refreshes(rig)).toEqual([]);
    });
  });

  describe("attack case T22: refreshes on a provider that rotates and detects reuse", () => {
    it("makes one refresh for requests at once, saves the rotated token before it uses the new one, and keeps the grant", async () => {
      const rig = createSignInRig();
      rig.server.behavior.rotateRefreshTokens = true;
      await rig.signIn();
      const signedInWith = rig.server.ledger.grants[0]?.currentRefreshToken ?? "";
      const savedWhenUsed: string[] = [];
      rig.server.handle(rig.server.apiHost, () => {
        savedWhenUsed.push([...rig.store.values()].join());
        return undefined;
      });

      const release = rig.server.holdTokenAnswers();
      const calls = Array.from({ length: 8 }, () => rig.api());
      await Promise.resolve();
      release();
      expect((await Promise.all(calls)).map((response) => response.status)).toEqual(
        Array(8).fill(200),
      );

      const rotated = rig.server.ledger.grants[0]?.currentRefreshToken ?? "";
      expect(rotated).not.toBe(signedInWith);
      expect(refreshes(rig)).toHaveLength(1);
      expect(savedWhenUsed.length).toBeGreaterThan(0);
      for (const saved of savedWhenUsed) {
        expect(saved).toContain(rotated);
        expect(saved).not.toContain(signedInWith);
      }
      expect(rig.server.ledger.grants[0]?.revoked).toBe(false);
    });

    it("goes on for many rounds without the provider ever seeing a retired refresh token", async () => {
      const rig = createSignInRig();
      rig.server.behavior.rotateRefreshTokens = true;
      await rig.signIn();
      for (let round = 0; round < 5; round++) {
        const calls = Array.from({ length: 4 }, () => rig.api());
        await Promise.all(calls);
        rig.advance(3600 * second);
      }
      expect(refreshes(rig)).toHaveLength(5);
      expect(new Set(refreshes(rig).map((request) => request.form["refresh_token"])).size).toBe(5);
      expect(rig.server.ledger.grants[0]?.revoked).toBe(false);
    });

    it("keeps the grant, and uses no token, when the provider rotates to a refresh token that is not fit to save", async () => {
      const rig = createSignInRig();
      rig.server.behavior.rotateRefreshTokens = true;
      await rig.signIn();
      const before = [...rig.store.values()];
      rig.server.behavior.makeToken = (kind, number) =>
        kind === "refresh" ? "short" : `fake-${kind}-token-${number}-padding`;

      await expect(rig.api()).rejects.toThrow();

      expect([...rig.store.values()]).toEqual(before);
    });

    it("doesn't let a sign-out during a refresh leave a grant behind", async () => {
      const rig = createSignInRig();
      rig.server.behavior.rotateRefreshTokens = true;
      await rig.signIn();
      const release = rig.server.holdTokenAnswers();
      const call = rig.api();
      await Promise.resolve();
      const signingOut = rig.signIns.signOut(signInName);
      release();
      await Promise.allSettled([call, signingOut]);

      expect(rig.store.size).toBe(0);
      expect(rig.server.ledger.grants[0]?.revoked).toBe(true);
      await expect(rig.api()).rejects.toMatchObject({ code: "sign-in-needed" });
    });
  });

  it("keeps the clock in step: a token that is within a minute of its end is refreshed, not placed", async () => {
    const rig = await signedInRig();
    await rig.api();
    rig.advance(3600 * second - 61 * second);
    await rig.api();
    expect(refreshes(rig)).toHaveLength(1);
    rig.advance(2 * second);
    await rig.api();
    expect(refreshes(rig)).toHaveLength(2);
    expect(minute).toBe(60_000);
  });
});
