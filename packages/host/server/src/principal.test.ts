import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  checkClaims,
  parseScope,
  principalFromRecord,
  principalToRecord,
  type SessionClaims,
  scopePrefix,
} from "./principal.ts";
import { ids, personalClaims } from "./stub-session-verifier.test-helper.ts";

const orgClaims = (role: unknown): SessionClaims => ({
  aud: "app",
  sub: ids.alice,
  scope: `o/${ids.acme}`,
  role,
});

describe("principal", () => {
  verifies("server.principal", () => {
    it("builds the principal for an end user in their own scope", () => {
      const session = checkClaims(personalClaims(ids.alice, { client: "halonic-code" }));
      expect(session?.principal).toEqual({
        actor: ids.alice,
        scope: { kind: "user", endUserId: ids.alice },
        role: "owner",
      });
      expect(session?.client).toBe("halonic-code");
      expect(Object.isFrozen(session?.principal)).toBe(true);
    });

    it("accepts a personal scope with no role as the owner", () => {
      expect(checkClaims(personalClaims(ids.alice, { role: undefined }))?.principal.role).toBe(
        "owner",
      );
    });

    it("refuses any audience other than exactly app", () => {
      for (const aud of [undefined, "", "App", "dashboard", ["app"], ["app", "dashboard"]]) {
        expect(checkClaims(personalClaims(ids.alice, { aud })), String(aud)).toBeNull();
      }
    });

    it("treats the claims as untrusted input", () => {
      for (const claims of [null, undefined, "claims", 42, [personalClaims(ids.alice)]]) {
        expect(checkClaims(claims), String(claims)).toBeNull();
      }
      for (const field of ["aud", "sub", "scope"]) {
        const claims: Record<string, unknown> = { ...personalClaims(ids.alice) };
        delete claims[field];
        expect(checkClaims(claims), field).toBeNull();
      }
      const withExtras = { ...personalClaims(ids.alice), exp: 1, iat: 0, admin: true };
      expect(checkClaims(withExtras)?.principal.actor).toBe(ids.alice);
    });

    it("refuses an end-user id or scope that breaks the name rule", () => {
      const badIds = ["", "eu_", "eu_short", "eu_a/bAAAAAAAAAAAAAAAA", "eu_..AAAAAAAAAAAAAAAA"];
      for (const sub of [...badIds, `eu_${"A".repeat(41)}`, 42, undefined]) {
        expect(checkClaims(personalClaims(ids.alice, { sub })), String(sub)).toBeNull();
      }
      const badScopes = [
        `u/${ids.alice}/`,
        `/u/${ids.alice}`,
        `u%2F${ids.alice}`,
        `x/${ids.alice}`,
      ];
      for (const scope of [...badScopes, `U/${ids.alice}`, `u/${ids.acme}`, ids.alice, null]) {
        expect(checkClaims(personalClaims(ids.alice, { scope })), String(scope)).toBeNull();
      }
    });

    it("refuses another end user's personal scope, and a personal role other than owner", () => {
      expect(checkClaims(personalClaims(ids.alice, { scope: `u/${ids.bob}` }))).toBeNull();
      for (const role of ["admin", "member", "", 1]) {
        expect(checkClaims(personalClaims(ids.alice, { role })), String(role)).toBeNull();
      }
    });

    it("needs a known role in an organisation's scope", () => {
      for (const role of ["owner", "admin", "member"]) {
        expect(checkClaims(orgClaims(role))?.principal.role).toBe(role);
      }
      for (const role of [undefined, "", "seller", "Owner", null]) {
        expect(checkClaims(orgClaims(role)), String(role)).toBeNull();
      }
    });

    it("keeps user and organisation scopes apart, even with the same suffix", () => {
      expect(parseScope("o/eu_aliceAAAAAAAAAAAAAAAA")).toBeNull();
      expect(parseScope("u/org_acmeAAAAAAAAAAAAAAAA")).toBeNull();
      const user = parseScope("u/eu_sameAAAAAAAAAAAAAAAA");
      const org = parseScope("o/org_sameAAAAAAAAAAAAAAAA");
      expect(user && scopePrefix(user)).toBe("u/eu_sameAAAAAAAAAAAAAAAA/");
      expect(org && scopePrefix(org)).toBe("o/org_sameAAAAAAAAAAAAAAAA/");
    });

    it("never lets one scope's names start another's", () => {
      // The ids built to collide (`a` + `b/x` against `a/b` + `x`, empty, `..`, `%2F`) are no ids at all.
      for (const id of [
        "a",
        "a/b",
        "",
        "..",
        "eu_a%2FbAAAAAAAAAAAAAAA",
        "eu_aAAAAAAAAAAAAAAAA/x",
      ]) {
        expect(parseScope(`u/${id}`), id).toBeNull();
      }
      const prefixes = [`u/${ids.alice}`, `u/${ids.alice}A`, `o/${ids.acme}`].map((text) => {
        const scope = parseScope(text);
        return scope === null ? "" : scopePrefix(scope);
      });
      for (const prefix of prefixes) {
        expect(prefix.endsWith("/")).toBe(true);
        const others = prefixes.filter((other) => other !== prefix);
        expect(others.some((other) => other.startsWith(prefix))).toBe(false);
      }
    });

    it("keeps the client claim out of the principal", () => {
      const desktop = checkClaims(personalClaims(ids.alice, { client: "desktop" }));
      const web = checkClaims(personalClaims(ids.alice, { client: undefined }));
      expect(desktop?.principal).toEqual(web?.principal);
      expect(Object.keys(desktop?.principal ?? {})).toEqual(["actor", "scope", "role"]);
      expect(checkClaims(personalClaims(ids.alice, { client: { admin: true } }))).toBeNull();
    });

    it("refuses a client claim that isn't 1 to 64 printable ASCII characters", () => {
      expect(checkClaims(personalClaims(ids.alice, { client: "c".repeat(64) }))?.client).toBe(
        "c".repeat(64),
      );
      for (const client of ["", "c".repeat(65), "desk\ntop", "desk\u0000top", "café", 7]) {
        expect(checkClaims(personalClaims(ids.alice, { client })), String(client)).toBeNull();
      }
    });

    it("stores a principal as a record and reads it back with the same checks", () => {
      const principal = checkClaims(orgClaims("admin"))?.principal;
      if (principal === undefined) {
        throw new Error("the claims should pass");
      }
      const record = principalToRecord(principal);
      expect(record).toEqual({ v: 1, actor: ids.alice, scope: `o/${ids.acme}`, role: "admin" });
      expect(Object.isFrozen(principal.scope)).toBe(true);
      expect(principalFromRecord(JSON.parse(JSON.stringify(record)))).toEqual(principal);
      expect(principalFromRecord({ ...record, v: 2 })).toBeNull();
      expect(
        principalFromRecord({ actor: ids.alice, scope: `o/${ids.acme}`, role: "admin" }),
      ).toBeNull();
      expect(principalFromRecord(null)).toBeNull();
      expect(principalFromRecord({ ...record, role: "seller" })).toBeNull();
      expect(principalFromRecord({ ...record, scope: `u/${ids.bob}`, role: "owner" })).toBeNull();
      expect(
        principalFromRecord({ v: 1, actor: ids.alice, scope: `u/${ids.alice}/`, role: "owner" }),
      ).toBeNull();
    });
  });
});
