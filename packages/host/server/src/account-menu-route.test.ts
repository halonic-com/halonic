import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server } from "./api.ts";
import type { CloudSignInPorts } from "./cloud-sign-in-api.ts";
import type { AccountUsage, ManyUserPorts } from "./many-users-api.ts";
import { ids, personalClaims, StubSessionVerifier } from "./stub-session-verifier.test-helper.ts";
import { testServer, unusedPort } from "./test-server.ts";

const host = "deploy.acme.example";
const cookieName = "__Host-acme-session";

const profileClaims = {
  name: "Sofia Marin",
  account: "https://account.acme.example/prod_acmeAAAAAAAAAAAAAAAA",
  product_name: "Acme Agents",
};

const cloudSignIn: CloudSignInPorts = {
  signInOrigin: "https://signin.acme.example",
  product: "prod_acmeAAAAAAAAAAAAAAAA",
  exchange: unusedPort("exchange"),
  refresh: unusedPort("refresh"),
  signOut: unusedPort("signOut"),
};

/**
 * A many-user server where `alice-token` carries Cloud's profile and `bob-token` carries none,
 * with any many-user port replaced.
 */
function manyUserServer(changes: Partial<ManyUserPorts> = {}, withCloudSignIn = true) {
  const errors: unknown[] = [];
  const server = testServer({
    passwordHash: null,
    runs: unusedPort("the unscoped runs"),
    runStore: unusedPort("the unscoped run store"),
    secrets: unusedPort("secrets"),
    trust: { check: async () => ({ state: "trusted", message: "Trusted." }) },
    config: { allowedHosts: [host], maxBodyBytes: 4096 },
    errorLog: { record: (error) => errors.push(error) },
    manyUsers: {
      verifier: new StubSessionVerifier({
        "alice-token": personalClaims(ids.alice, profileClaims),
        "bob-token": personalClaims(ids.bob),
      }),
      cookieName,
      scopedRuns: () => ({
        runs: unusedPort("the scoped runs"),
        runStore: unusedPort("the scoped run store"),
      }),
      ...(withCloudSignIn ? { cloudSignIn } : {}),
      ...changes,
    },
  });
  return { server, errors };
}

/** The answer's warnings, the part these tests look at. */
async function readWarnings(server: Server): Promise<{ warnings: unknown }> {
  return (await readMenu(server, "alice-token")).json() as Promise<{ warnings: unknown }>;
}

function readMenu(server: Server, token?: string, onHost = host): Promise<Response> {
  const authorization = token === undefined ? {} : { authorization: `Bearer ${token}` };
  return server.handle(
    new Request(`https://${onHost}/api/account-menu`, {
      headers: { host: onHost, ...authorization },
    }),
  );
}

describe("account menu route", () => {
  verifies("server.account-menu", () => {
    it("gives a signed-in customer their name, plan, percent and both addresses, no-store", async () => {
      const asked: string[] = [];
      const accountUsage = async (principal: { actor: string }): Promise<AccountUsage> => {
        asked.push(principal.actor);
        return { plan: "Pro", usedPercent: 42 };
      };
      const { server } = manyUserServer({ accountUsage });
      const response = await readMenu(server, "alice-token");
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({
        name: "Sofia Marin",
        productName: "Acme Agents",
        plan: "Pro",
        usedPercent: 42,
        warnings: [],
        accountUrl: "https://account.acme.example/prod_acmeAAAAAAAAAAAAAAAA",
        planUrl: "https://account.acme.example/prod_acmeAAAAAAAAAAAAAAAA#plan",
      });
      expect(asked).toEqual([ids.alice]);
    });

    it("answers no plan and no percent when the deployment can't tell them", async () => {
      const { server } = manyUserServer();
      const answer = await (await readMenu(server, "alice-token")).json();
      expect(answer).toMatchObject({ plan: null, usedPercent: null, warnings: [] });
      const noLimits = manyUserServer({
        accountUsage: async () => ({ plan: null, usedPercent: null }),
      });
      const limitless = await (await readMenu(noLimits.server, "alice-token")).json();
      expect(limitless).toMatchObject({ name: "Sofia Marin", plan: null, usedPercent: null });
    });
  });

  verifies("server.account-menu-warnings", () => {
    it("warns of agent time at 82%, and of each unit from 80% and under 100%, highest first", async () => {
      const resetsAt = "2026-12-02T00:00:00.000Z";
      const units = [
        { unit: "runs", percent: 79, resetsAt },
        { unit: "harnessMs", percent: 82, resetsAt },
        { unit: "cost", percent: 100, resetsAt },
        { unit: "tokens", percent: 95, resetsAt },
      ];
      const { server } = manyUserServer({
        accountUsage: async () => ({ plan: "Pro", usedPercent: 100, units }),
      });
      const answer = await readWarnings(server);
      expect(answer.warnings).toEqual([
        { unit: "tokens", percent: 95, resetsAt },
        { unit: "harnessMs", percent: 82, resetsAt },
      ]);
    });

    it("passes on only the unit, the percent and the reset time", async () => {
      const resetsAt = "2026-12-02T00:00:00.000Z";
      const unit = { unit: "cost", percent: 80, resetsAt, used: 8_000_000, limit: 10_000_000 };
      const { server } = manyUserServer({
        accountUsage: async () => ({ plan: "Pro", usedPercent: 80, units: [unit] }),
      });
      const answer = await readWarnings(server);
      expect(answer.warnings).toEqual([{ unit: "cost", percent: 80, resetsAt }]);
    });
  });

  verifies("server.account-menu", () => {
    it("answers 404 for a single-user Studio, signed in or not", async () => {
      // Without a password the server answers only on this computer's own address.
      const studios = [
        { passwordHash: null, onHost: "127.0.0.1:4100" },
        { passwordHash: "hash", onHost: host },
      ];
      for (const { passwordHash, onHost } of studios) {
        const server = testServer({ passwordHash, config: { allowedHosts: [host] } });
        for (const token of [undefined, "alice-token"]) {
          const response = await readMenu(server, token, onHost);
          expect(response.status, `${onHost} ${token}`).toBe(404);
          expect(await response.json()).toMatchObject({ code: "not_found" });
        }
      }
    });

    it("answers 404 for many users without Cloud sign-in, even with a profile in the session", async () => {
      const accountUsage = unusedPort<() => never>("accountUsage");
      const { server } = manyUserServer({ accountUsage }, false);
      const response = await readMenu(server, "alice-token");
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "not_found" });
    });

    it("answers 404 for a session without a profile, and 401 without a session", async () => {
      const { server } = manyUserServer();
      expect((await readMenu(server, "bob-token")).status).toBe(404);
      expect((await readMenu(server)).status).toBe(401);
    });

    it("fails as a server error when the usage can't be read, and logs why", async () => {
      const failure = new Error("usage object unreachable");
      const { server, errors } = manyUserServer({
        accountUsage: async () => {
          throw failure;
        },
      });
      const response = await readMenu(server, "alice-token");
      expect(response.status).toBe(500);
      expect(errors).toEqual([failure]);
    });
  });
});
