import type { RunExecutor, RunStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server } from "./api.ts";
import { manyUserRouteTable } from "./many-user-routes.ts";
import type { ManyUserPorts } from "./many-users-api.ts";
import { memoryRunOwnership } from "./memory-run-ownership.test-helper.ts";
import { describeRoutes } from "./route-table.ts";
import { ids, personalClaims, StubSessionVerifier } from "./stub-session-verifier.test-helper.ts";
import { testServer, unusedPort } from "./test-server.ts";

const host = "deploy.acme.example";

/**
 * The routes an end user may call. A route added to the many-user table fails the first test
 * until someone adds it here, on purpose: a new route is hidden from end users by default.
 */
const endUserAllowList = [
  "public GET /api/hello",
  "public GET /api/sign-in",
  "public GET /api/sign-in/return",
  "public POST /api/session/refresh",
  "public POST /api/sign-out",
  "signed-in GET /api/session",
  "signed-in GET /api/waiting-runs",
  "signed-in POST /api/runs",
  "signed-in GET /api/runs/:runId",
  "signed-in GET /api/runs/:runId/events",
  "signed-in POST /api/runs/:runId/events",
  "signed-in POST /api/runs/:runId/cancel",
];

/** Routes of an owner's server that change the project or show how it is set up. */
const ownerOnlyRoutes = [
  ["GET", "/"],
  ["GET", "/index.html"],
  ["GET", "/assets/index.js"],
  ["POST", "/api/agent-runs"],
  ["POST", "/api/chat-turn"],
  ["POST", "/api/connector-calls"],
  ["POST", "/api/login"],
  ["POST", "/api/logout"],
  ["POST", "/api/sign-in"],
  ["GET", "/api/trust"],
  ["GET", "/api/workspace"],
  ["GET", "/api/secrets/anthropic"],
  ["PUT", "/api/secrets/anthropic"],
  ["GET", "/api/paperclip-keys/list"],
  ["GET", "/api/model-choice/current"],
  ["GET", "/api/google/setups"],
  ["GET", "/api/routines"],
  ["GET", "/api/run-updates"],
  ["POST", "/api/messaging/send"],
  ["POST", "/api/webhooks/acme/nightly"],
] as const;

function setup(): Server {
  const manyUsers: ManyUserPorts = {
    verifier: new StubSessionVerifier({ "alice-token": personalClaims(ids.alice) }),
    cookieName: "acme-session",
    scopedRuns: () => ({
      runs: unusedPort("the scoped runs") as RunExecutor,
      runStore: unusedPort("the scoped run store") as Pick<RunStore, "list" | "get">,
      ownership: memoryRunOwnership(),
    }),
  };
  return testServer({
    passwordHash: null,
    runs: unusedPort("the unscoped runs"),
    runStore: unusedPort("the unscoped run store"),
    secrets: unusedPort("secrets"),
    trust: { check: async () => ({ state: "trusted", message: "Trusted." }) },
    studioPage: { read: async () => new TextEncoder().encode("<html>studio</html>") },
    config: { allowedHosts: [host], maxBodyBytes: 4096 },
    manyUsers,
  });
}

describe("end-user routes", () => {
  verifies("server.end-user-routes", () => {
    it("declares only the routes on the end-user allow list", () => {
      const declared = describeRoutes(manyUserRouteTable).map(
        ({ access, method, path }) => `${access} ${method} ${path}`,
      );
      expect(declared).toEqual(endUserAllowList);
    });

    it("answers 404 to an end user, signed in or not, on every route of the owner's server", async () => {
      const server = setup();
      for (const [method, path] of ownerOnlyRoutes) {
        for (const headers of [{}, { authorization: "Bearer alice-token" }]) {
          const answer = await server.handle(
            new Request(`https://${host}${path}`, {
              method,
              headers: { host, "content-type": "application/json", ...headers },
              ...(method === "GET" ? {} : { body: "{}" }),
            }),
          );
          expect(answer.status, `${method} ${path}`).toBe(404);
          expect(await answer.json()).toMatchObject({ code: "not_found" });
        }
      }
    });
  });
});
