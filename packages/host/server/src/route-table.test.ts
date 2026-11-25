import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { manyUserRouteTable } from "./many-user-routes.ts";
import { describeRoutes, matchRoute, type RouteEntry } from "./route-table.ts";

const table: RouteEntry<string>[] = [
  {
    method: "GET",
    path: "/api/runs/:runId",
    access: "signed-in",
    kind: "run-read",
    handler: "one",
  },
  {
    method: "POST",
    path: "/api/runs/:runId/cancel",
    access: "signed-in",
    kind: "run-write",
    handler: "cancel",
  },
  { method: "GET", path: "/api/hello", access: "public", kind: "other", handler: "hello" },
];

describe("declared route table", () => {
  verifies("server.route-table", () => {
    it("matches the method and every segment, and reads a well-formed run id", () => {
      expect(matchRoute(table, "GET", "/api/runs/run_1")).toEqual({
        route: table[0],
        params: { runId: "run_1" },
      });
      expect(matchRoute(table, "POST", "/api/runs/run_1/cancel")?.route.handler).toBe("cancel");
      expect(matchRoute(table, "GET", "/api/hello")).toEqual({ route: table[2], params: {} });
    });

    it("matches nothing for another method, an extra segment or a malformed run id", () => {
      const misses = [
        ["POST", "/api/hello"],
        ["GET", "/api/runs/run_1/"],
        ["GET", "/api/runs/"],
        ["GET", "/api/runs/a%2Fb"],
        ["GET", "/api/runs/%E0%A4%A"],
        ["GET", "/api/runs/run_1/cancel"],
      ] as const;
      for (const [method, path] of misses) {
        expect(matchRoute(table, method, path), `${method} ${path}`).toBeNull();
      }
    });

    it("declares every run route of a many-user server behind a session", () => {
      const routes = describeRoutes(manyUserRouteTable);
      const runRoutes = routes.filter((route) => route.kind !== "other");
      expect(runRoutes.map(({ method, path, kind }) => `${kind} ${method} ${path}`)).toEqual([
        "run-list GET /api/waiting-runs",
        "run-start POST /api/runs",
        "run-read GET /api/runs/:runId",
        "run-read GET /api/runs/:runId/events",
        "run-write POST /api/runs/:runId/events",
        "run-write POST /api/runs/:runId/cancel",
      ]);
      for (const route of runRoutes) {
        expect(route.access, `${route.method} ${route.path}`).toBe("signed-in");
      }
    });

    it("declares each method and path once", () => {
      const keys = describeRoutes(manyUserRouteTable).map(
        ({ method, path }) => `${method} ${path}`,
      );
      expect(new Set(keys).size).toBe(keys.length);
    });
  });
});
