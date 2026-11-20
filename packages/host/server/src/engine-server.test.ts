import { launchTokenRefusalContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { chatTurnPath } from "./chat-turn-routes.ts";
import { connectorCallPath } from "./connector-routes.ts";
import { type EngineRoutePorts, engineRoutes } from "./engine-routes.ts";
import {
  enginePort,
  engineToken,
  passing,
  placedRoutine,
  sendTo,
  testEngine,
} from "./engine-server.test-helper.ts";
import { createEngineServer } from "./engine-server.ts";
import { googlePathPrefix } from "./google-routes.ts";
import { googleCallbackPath } from "./google-sign-in-routes.ts";
import { bearerMatches } from "./launch-token-check.ts";
import { providerKeyPathPrefix } from "./provider-key-routes.ts";
import { webhookPathPrefix } from "./webhooks.ts";

/** Every route the engine role serves. A new one is a security review's business, not a quiet addition. */
const expectedRoutes = [
  "GET /api/hello",
  "POST /api/runs",
  "POST /api/agent-runs",
  "GET /api/waiting-runs",
  "GET /api/runs/<runId>",
  "GET /api/runs/<runId>/events",
  "POST /api/runs/<runId>/events",
  "POST /api/runs/<runId>/cancel",
  "GET /api/run-updates",
  "GET /api/routines",
  "POST /api/routines/<scope>/<routine>/run",
];

/** A route's path with each `<name>` filled in, as a caller would send it. */
function concrete(path: string): string {
  return path.replace("<runId>", "run_1").replace("<scope>", "acme").replace("<routine>", "digest");
}

launchTokenRefusalContract("the engine role's server", {
  async start() {
    const { server } = testEngine();
    return {
      token: engineToken,
      port: enginePort,
      servedPath: "/api/routines",
      send: async ({ method, path, headers }) =>
        (await sendTo(server, method, path, { headers })).status,
      close: async () => {},
    };
  },
});

verifies("server.engine-server", () => {
  describe("createEngineServer", () => {
    it("serves its hello, the run routes, run-updates and the two routine routes, and no other", () => {
      const routes = engineRoutes({} as EngineRoutePorts);
      expect(routes.map((route) => `${route.method} ${route.path}`)).toEqual(expectedRoutes);
    });

    it("answers 401 to every route without the token, and never runs it", async () => {
      const { server, calls } = testEngine({ routines: [placedRoutine()] });
      for (const route of expectedRoutes) {
        const [method = "", path = ""] = route.split(" ");
        const answer = await sendTo(server, method, concrete(path), {
          headers: { host: passing.host },
        });
        expect(answer.status, route).toBe(401);
        expect(answer.headers.get("www-authenticate"), route).toBe("Bearer");
        expect(await answer.json(), route).toMatchObject({ code: "launch_token_required" });
      }
      expect(calls).toEqual({ started: [], following: new Set(), listed: [], logged: [] });
    });

    it("answers 404 with the token to every route `serve` has and the engine doesn't", async () => {
      const { server } = testEngine();
      // Built from `serve`'s own path constants where it has them, so a renamed route can't leave this list testing nothing.
      const others = [
        "GET /api/trust",
        "GET /api/session",
        "POST /api/login",
        "POST /api/logout",
        "GET /api/workspace",
        `POST ${webhookPathPrefix}acme/digest`,
        `POST ${chatTurnPath}`,
        `POST ${connectorCallPath}`,
        `GET ${providerKeyPathPrefix}ACME_API_KEY`,
        `GET ${googlePathPrefix}setups`,
        `GET ${googleCallbackPath}`,
        "GET /",
      ];
      for (const route of others) {
        const [method = "", path = ""] = route.split(" ");
        expect((await sendTo(server, method, path)).status, route).toBe(404);
      }
    });

    it("refuses a body over the limit with 413, and serves one under it", async () => {
      const { server } = testEngine({ routines: [placedRoutine()], maxBodyBytes: 8 });
      const big = await sendTo(server, "POST", "/api/routines/acme/digest/run", {
        body: JSON.stringify({ padding: "x".repeat(16) }),
      });
      expect(big.status).toBe(413);
      expect((await sendTo(server, "POST", "/api/routines/acme/digest/run")).status).toBe(201);
    });

    it("answers 404 to a run id that isn't one, and 415 to a start that isn't JSON", async () => {
      const { server, calls } = testEngine();
      const longId = "r".repeat(300);
      expect((await sendTo(server, "GET", `/api/runs/${longId}`)).status).toBe(404);
      const form = await sendTo(server, "POST", "/api/runs", { type: "text/plain" });
      expect(form.status).toBe(415);
      expect(calls.started).toEqual([]);
    });

    it("keeps a failure's cause out of the answer and logs it", async () => {
      const cause = new Error("the acme store broke");
      const { server, calls } = testEngine({ listFails: cause });
      const answer = await sendTo(server, "GET", "/api/routines");
      expect(answer.status).toBe(500);
      expect(answer.headers.get("x-frame-options")).toBe("DENY");
      expect(await answer.text()).not.toContain("acme");
      expect(calls.logged).toEqual([cause]);
    });

    it("won't start with a token shorter than a launch token or a body limit of zero", () => {
      const ports = {} as Parameters<typeof createEngineServer>[0]["ports"];
      const options = { launchToken: engineToken, port: () => enginePort, maxBodyBytes: 1, ports };
      expect(() => createEngineServer({ ...options, launchToken: "" })).toThrow(RangeError);
      expect(() => createEngineServer({ ...options, launchToken: "short" })).toThrow(RangeError);
      expect(() => createEngineServer({ ...options, maxBodyBytes: 0 })).toThrow(RangeError);
    });
  });

  describe("bearerMatches", () => {
    it("matches only the exact bearer header", () => {
      expect(bearerMatches(`Bearer ${engineToken}`, engineToken)).toBe(true);
      expect(bearerMatches(engineToken, engineToken)).toBe(false);
      expect(bearerMatches(`bearer ${engineToken}`, engineToken)).toBe(false);
      expect(bearerMatches(undefined, engineToken)).toBe(false);
    });
  });
});
