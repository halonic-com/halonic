import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server } from "./api.ts";
import type { CloudSignInPorts, RefreshOutcome } from "./cloud-sign-in-api.ts";
import { checkClaims } from "./principal.ts";
import { ids, personalClaims, StubSessionVerifier } from "./stub-session-verifier.test-helper.ts";
import { testServer, unusedPort } from "./test-server.ts";

const host = "deploy.acme.example";
const sessionCookieName = "__Host-acme-session";
const refreshCookieName = "__Host-halonic-refresh";
const nowMs = 1_800_000_000_000;
const cleared = [
  `${sessionCookieName}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`,
  `${refreshCookieName}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`,
];

const nextSession: RefreshOutcome = {
  ok: true,
  session: {
    token: "header.payload.next",
    tokenEndsAt: nowMs + 900_000,
    refreshCredential: "rc_next",
    sessionEndsAt: nowMs + 3600_000,
  },
};

/** A many-user server with Cloud sign-in, whose refresh answers `answer` and records each call. */
function setup(answer: () => Promise<RefreshOutcome> = async () => nextSession) {
  const refreshes: string[] = [];
  const errors: unknown[] = [];
  const cloudSignIn: CloudSignInPorts = {
    signInOrigin: "https://signin.acme.example",
    product: "prod_acmeAAAAAAAAAAAAAAAA",
    exchange: unusedPort("exchange"),
    refresh: async (credential) => {
      refreshes.push(credential);
      return answer();
    },
    now: () => nowMs,
  };
  const server = testServer({
    passwordHash: null,
    runs: unusedPort("the unscoped runs"),
    runStore: unusedPort("the unscoped run store"),
    secrets: unusedPort("secrets"),
    trust: { check: async () => ({ state: "trusted", message: "Trusted." }) },
    config: { allowedHosts: [host], maxBodyBytes: 4096 },
    errorLog: { record: (error) => errors.push(error) },
    manyUsers: {
      verifier: new StubSessionVerifier({ "alice-token": personalClaims(ids.alice) }),
      cookieName: sessionCookieName,
      scopedRuns: unusedPort("scoped runs"),
      cloudSignIn,
    },
  });
  return { server, refreshes, errors };
}

function post(
  server: Server,
  path: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return server.handle(
    new Request(`https://${host}${path}`, { method: "POST", headers: { host, ...headers } }),
  );
}

function refreshWith(server: Server, cookie?: string, headers: Record<string, string> = {}) {
  return post(
    server,
    "/api/session/refresh",
    cookie === undefined ? headers : { cookie, ...headers },
  );
}

describe("cloud session routes", () => {
  verifies("server.cloud-session-refresh", () => {
    it("refreshes once with the refresh cookie and keeps the next session in two strict cookies", async () => {
      const { server, refreshes } = setup();
      const response = await refreshWith(server, `${refreshCookieName}=rc_old`);
      expect(refreshes).toEqual(["rc_old"]);
      expect(response.status).toBe(204);
      expect(response.headers.getSetCookie()).toEqual([
        `${sessionCookieName}=header.payload.next; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=900`,
        `${refreshCookieName}=rc_next; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=3600`,
      ]);
    });

    it("clears both cookies when there is no single refresh cookie, without asking Cloud", async () => {
      const cookies = [
        undefined,
        `${refreshCookieName}=`,
        `${refreshCookieName}=a; ${refreshCookieName}=b`,
      ];
      for (const cookie of cookies) {
        const { server, refreshes } = setup();
        const response = await refreshWith(server, cookie);
        expect(refreshes).toEqual([]);
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({
          code: "session_ended",
          message: "Your session has ended. Sign in again.",
        });
        expect(response.headers.getSetCookie()).toEqual(cleared);
      }
    });

    it("clears both cookies when Cloud ended the session, naming only reasons from its list", async () => {
      const answers: [string | null, string | undefined][] = [
        ["signed_out", "signed_out"],
        ["expired", "expired"],
        ["user_suspended", "user_suspended"],
        ["<b>gone</b>", undefined],
        [null, undefined],
      ];
      for (const [reason, named] of answers) {
        const { server } = setup(async () => ({ ok: false, ended: reason }));
        const response = await refreshWith(server, `${refreshCookieName}=rc_old`);
        expect(response.status).toBe(401);
        const body: unknown = await response.json();
        expect(body).toMatchObject({ code: "session_ended" });
        expect((body as { ended?: string }).ended).toBe(named);
        expect(response.headers.getSetCookie()).toEqual(cleared);
        expect(response.headers.get("cache-control")).toBe("no-store");
      }
    });

    it("keeps the cookies and logs it when Cloud can't answer", async () => {
      const { server, errors } = setup(async () => {
        throw new Error("Cloud unavailable");
      });
      const response = await refreshWith(server, `${refreshCookieName}=rc_old`);
      expect(response.status).toBe(503);
      expect(((await response.json()) as { code: string }).code).toBe(
        "session_refresh_unavailable",
      );
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(errors).toEqual([new Error("Cloud unavailable")]);
    });

    it("never writes a credential that would break out of its cookie", async () => {
      const session = { ...nextSession.session, refreshCredential: "rc; Domain=evil.example" };
      const { server, errors } = setup(async () => ({ ok: true, session }) as RefreshOutcome);
      const response = await refreshWith(server, `${refreshCookieName}=rc_old`);
      expect(response.status).toBe(401);
      expect(response.headers.getSetCookie()).toEqual(cleared);
      expect(errors).toHaveLength(1);
    });

    it("signs out by clearing both cookies", async () => {
      const { server, refreshes } = setup();
      const response = await post(server, "/api/sign-out", {
        cookie: `${refreshCookieName}=rc_old`,
      });
      expect(response.status).toBe(204);
      expect(response.headers.getSetCookie()).toEqual(cleared);
      expect(refreshes).toEqual([]);
    });

    it("refuses both routes from another site, and answers only POST", async () => {
      const { server, refreshes } = setup();
      for (const path of ["/api/session/refresh", "/api/sign-out"]) {
        const response = await post(server, path, {
          cookie: `${refreshCookieName}=rc_old`,
          "sec-fetch-site": "cross-site",
        });
        expect(((await response.json()) as { code: string }).code).toBe("from_other_site");
        expect(response.headers.getSetCookie()).toEqual([]);
        const get = await server.handle(
          new Request(`https://${host}${path}`, { headers: { host } }),
        );
        expect(get.status).toBe(404);
      }
      expect(refreshes).toEqual([]);
    });

    it("carries a well-formed sid as the session id, and never refuses claims for it", () => {
      expect(checkClaims(personalClaims(ids.alice, { sid: "ses_1" }))?.sessionId).toBe("ses_1");
      expect(checkClaims(personalClaims(ids.alice))?.sessionId).toBeNull();
      expect(checkClaims(personalClaims(ids.alice, { sid: 42 }))?.sessionId).toBeNull();
      expect(checkClaims(personalClaims(ids.alice, { sid: "a b" }))?.sessionId).toBeNull();
    });
  });
});
