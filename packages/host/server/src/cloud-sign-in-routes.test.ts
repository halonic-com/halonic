import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RequestLogEntry, Server } from "./api.ts";
import type { CloudSignInPorts, CodeExchangeOutcome } from "./cloud-sign-in-api.ts";
import { ids, personalClaims, StubSessionVerifier } from "./stub-session-verifier.test-helper.ts";
import { testServer, unusedPort } from "./test-server.ts";

const host = "deploy.acme.example";
const signInOrigin = "https://signin.acme.example";
const product = "prod_acmeAAAAAAAAAAAAAAAA";
const sessionCookieName = "__Host-acme-session";
const stateCookieName = "__Host-halonic-sign-in-state";
const nowMs = 1_800_000_000_000;

const goodSession: CodeExchangeOutcome = {
  ok: true,
  session: {
    token: "header.payload.signature",
    tokenEndsAt: nowMs + 900_000,
    refreshCredential: "rc_newCredential",
    sessionEndsAt: nowMs + 30 * 24 * 3600_000,
  },
};

/** A many-user server with Cloud sign-in, whose exchange answers `answer` and records each call. */
function setup(answer: () => Promise<CodeExchangeOutcome> = async () => goodSession) {
  const exchanges: { code: string; state: string }[] = [];
  const logged: RequestLogEntry[] = [];
  const errors: unknown[] = [];
  const cloudSignIn: CloudSignInPorts = {
    signInOrigin,
    product,
    exchange: async (code, state) => {
      exchanges.push({ code, state });
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
    requestLog: { record: (entry) => logged.push(entry) },
    errorLog: { record: (error) => errors.push(error) },
    manyUsers: {
      verifier: new StubSessionVerifier({ "alice-token": personalClaims(ids.alice) }),
      cookieName: sessionCookieName,
      scopedRuns: unusedPort("scoped runs"),
      cloudSignIn,
    },
  });
  return { server, exchanges, logged, errors };
}

function get(server: Server, path: string, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = { host, ...(cookie === undefined ? {} : { cookie }) };
  return server.handle(new Request(`https://${host}${path}`, { headers }));
}

function setCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

/** The `state` a start put in its cookie, which must also be the one in Cloud's address. */
function stateOf(response: Response): string {
  const cookie = setCookies(response).find((line) => line.startsWith(`${stateCookieName}=`));
  const state = cookie?.slice(stateCookieName.length + 1).split(";")[0] ?? "";
  expect(new URL(response.headers.get("location") ?? "").searchParams.get("state")).toBe(state);
  return state;
}

async function returnWith(
  server: Server,
  query: Record<string, string>,
  cookie?: string,
): Promise<Response> {
  return get(server, `/api/sign-in/return?${new URLSearchParams(query)}`, cookie);
}

describe("cloud sign-in routes", () => {
  verifies("server.cloud-sign-in", () => {
    it("starts at Cloud's sign-in page with a new state that it also keeps in a cookie", async () => {
      const { server } = setup();
      const response = await get(server, "/api/sign-in");
      expect(response.status).toBe(303);
      const page = new URL(response.headers.get("location") ?? "");
      expect(page.origin).toBe(signInOrigin);
      expect(page.pathname).toBe("/");
      expect(page.searchParams.get("product")).toBe(product);
      expect(page.searchParams.get("place")).toBe("app");
      expect(page.searchParams.get("path")).toBe("/api/sign-in/return");
      expect(page.searchParams.has("ended")).toBe(false);
      const state = stateOf(response);
      expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(setCookies(response)).toEqual([
        `${stateCookieName}=${state}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`,
      ]);
      expect(stateOf(await get(server, "/api/sign-in"))).not.toBe(state);
    });

    it("exchanges a code once when the state matches, and keeps the session in two strict cookies", async () => {
      const { server, exchanges } = setup();
      const state = stateOf(await get(server, "/api/sign-in"));
      const response = await returnWith(
        server,
        { code: "one-time", state },
        `${stateCookieName}=${state}`,
      );
      expect(exchanges).toEqual([{ code: "one-time", state }]);
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(setCookies(response)).toEqual([
        `${sessionCookieName}=header.payload.signature; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=900`,
        `__Host-halonic-refresh=rc_newCredential; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000`,
        `${stateCookieName}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`,
      ]);
    });

    it("never exchanges the code without a matching state, and starts over with a new one", async () => {
      const kept = "A".repeat(43);
      const cases: [Record<string, string>, string | undefined][] = [
        [{ code: "c", state: kept }, undefined],
        [{ code: "c", state: kept }, `${stateCookieName}=`],
        [{ code: "c", state: `${"A".repeat(42)}B` }, `${stateCookieName}=${kept}`],
        [{ code: "c", state: "short" }, `${stateCookieName}=${kept}`],
        [{ code: "c" }, `${stateCookieName}=${kept}`],
        [{ state: kept }, `${stateCookieName}=${kept}`],
        [{ code: "c", state: kept }, `${stateCookieName}=${kept}; ${stateCookieName}=${kept}`],
      ];
      for (const [query, cookie] of cases) {
        const { server, exchanges } = setup();
        const response = await returnWith(server, query, cookie);
        expect(exchanges).toEqual([]);
        expect(response.status).toBe(303);
        expect(new URL(response.headers.get("location") ?? "").origin).toBe(signInOrigin);
        expect(stateOf(response)).not.toBe(kept);
      }
    });

    it("sends a refused sign-in back to Cloud with a reason only from its fixed list", async () => {
      const refusals: [string, string | null][] = [
        ["signin.user_suspended", "user_suspended"],
        ["signin.product_paused", "product_paused"],
        ["signin.user_deleted", "user_deleted"],
        ["signin.link_expired", null],
        ["signin.product_not_live", null],
        ["<b>Cloud says no</b>", null],
      ];
      for (const [refusal, ended] of refusals) {
        const { server, exchanges } = setup(async () => ({ ok: false, refusal }));
        const state = "S".repeat(43);
        const response = await returnWith(
          server,
          { code: "c", state },
          `${stateCookieName}=${state}`,
        );
        expect(exchanges).toHaveLength(1);
        const page = new URL(response.headers.get("location") ?? "");
        expect(page.searchParams.get("ended")).toBe(ended);
        expect(setCookies(response).some((line) => line.startsWith(sessionCookieName))).toBe(false);
        expect(stateOf(response)).not.toBe(state);
      }
    });

    it("logs a failed exchange, never retries it, and starts over", async () => {
      const { server, exchanges, errors } = setup(async () => {
        throw new Error("Cloud unreachable");
      });
      const state = "S".repeat(43);
      const response = await returnWith(
        server,
        { code: "c", state },
        `${stateCookieName}=${state}`,
      );
      expect(exchanges).toHaveLength(1);
      expect(errors).toEqual([new Error("Cloud unreachable")]);
      expect(new URL(response.headers.get("location") ?? "").origin).toBe(signInOrigin);
    });

    it("refuses to write a token or credential that would break out of its cookie", async () => {
      const session = { ...goodSession.session, refreshCredential: "rc; Domain=evil.example" };
      const { server, errors } = setup(async () => ({ ok: true, session }) as CodeExchangeOutcome);
      const state = "S".repeat(43);
      const response = await returnWith(
        server,
        { code: "c", state },
        `${stateCookieName}=${state}`,
      );
      expect(errors).toHaveLength(1);
      expect(setCookies(response).every((line) => line.startsWith(stateCookieName))).toBe(true);
    });

    it("keeps the return route out of the request log, and answers only GET", async () => {
      const { server, logged } = setup();
      const state = "S".repeat(43);
      await get(server, "/api/sign-in");
      await returnWith(server, { code: "c", state }, `${stateCookieName}=${state}`);
      expect(logged.map((entry) => entry.path)).toEqual(["/api/sign-in"]);
      const post = await server.handle(
        new Request(`https://${host}/api/sign-in/return`, { method: "POST", headers: { host } }),
      );
      expect(post.status).toBe(404);
    });
  });
});
