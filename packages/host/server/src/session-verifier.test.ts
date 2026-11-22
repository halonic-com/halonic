import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { readSessionCredential, verifySession } from "./session-verifier.ts";
import { ids, personalClaims, StubSessionVerifier } from "./stub-session-verifier.test-helper.ts";

const cookieName = "__Host-halonic-session";

function request(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://acme.example${path}`, { headers });
}

function verifier(): StubSessionVerifier {
  return new StubSessionVerifier({
    good: personalClaims(ids.alice),
    other: personalClaims(ids.bob),
    wrongAudience: personalClaims(ids.alice, { aud: "dashboard" }),
    othersScope: personalClaims(ids.alice, { scope: `u/${ids.bob}` }),
  });
}

describe("session credential", () => {
  verifies("server.session-credential", () => {
    it("reads the session cookie or a bearer token from the headers", () => {
      expect(
        readSessionCredential(request("/", { cookie: `a=1; ${cookieName}=good` }), cookieName),
      ).toEqual({
        kind: "cookie",
        token: "good",
      });
      expect(
        readSessionCredential(request("/", { authorization: "bearer good" }), cookieName),
      ).toEqual({
        kind: "bearer",
        token: "good",
      });
      expect(readSessionCredential(request("/"), cookieName)).toBe("none");
    });

    it("never reads a token from the address, not even for the event stream", async () => {
      for (const path of [
        "/api/runs?access_token=good",
        "/api/runs/r1/events?token=good&bearer=good",
      ]) {
        const stub = verifier();
        const result = await verifySession(request(path), { verifier: stub, cookieName });
        expect(result).toEqual({ ok: false, refusal: "none" });
        expect(stub.seen).toEqual([]);
      }
      const stub = verifier();
      const withCookie = request("/api/runs?access_token=other", { cookie: `${cookieName}=good` });
      const result = await verifySession(withCookie, { verifier: stub, cookieName });
      expect(result.ok && result.session.principal.actor).toBe(ids.alice);
      expect(stub.seen).toEqual([{ kind: "cookie", token: "good" }]);
    });

    it("refuses two credentials, an empty cookie and a malformed authorization header", () => {
      const refusals: [Record<string, string>, string][] = [
        [{ cookie: `${cookieName}=good`, authorization: "Bearer good" }, "ambiguous"],
        [{ cookie: `${cookieName}=good; ${cookieName}=other` }, "ambiguous"],
        [{ cookie: `${cookieName}=` }, "refused"],
        [{ authorization: "Basic Z29vZA==" }, "refused"],
        [{ authorization: "Bearer" }, "refused"],
        [{ authorization: "Bearer good other" }, "refused"],
        [{ authorization: "Bearer good, Bearer other" }, "refused"],
      ];
      for (const [headers, refusal] of refusals) {
        expect(
          readSessionCredential(request("/", headers), cookieName),
          JSON.stringify(headers),
        ).toBe(refusal);
      }
    });

    it("gives a bearer token the same principal as the same token in the cookie", async () => {
      const byCookie = await verifySession(request("/", { cookie: `${cookieName}=good` }), {
        verifier: verifier(),
        cookieName,
      });
      const byBearer = await verifySession(request("/", { authorization: "Bearer good" }), {
        verifier: verifier(),
        cookieName,
      });
      expect(byCookie.ok).toBe(true);
      expect(byBearer).toEqual(byCookie);
    });

    it("runs the shared claim checks on whatever the verifier returns", async () => {
      for (const token of ["wrongAudience", "othersScope", "unknown"]) {
        const result = await verifySession(request("/", { authorization: `Bearer ${token}` }), {
          verifier: verifier(),
          cookieName,
        });
        expect(result, token).toEqual({ ok: false, refusal: "refused" });
      }
    });
  });
});
