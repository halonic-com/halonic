import { parseScope, type Scope, scopeName } from "@halonicjs/host-server";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  deleteScopeRoutes,
  eraseScopeStores,
  type ScopeStores,
  UsageUnsentError,
} from "./delete-scope.ts";
import { ConfigurationError, type RuntimeEnv } from "./env.ts";

const env = {} as RuntimeEnv;
const acme = "o/org_acme0123456789abcdef";

/** Stores that write down each erase, in order, with the runs `r1` and `r2` in the run list. */
function recordingStores(unsent = 0): { stores: ScopeStores; erased: string[] } {
  const erased: string[] = [];
  const note = (what: string) => async () => {
    erased.push(what);
  };
  const stores: ScopeStores = {
    runs: { runIds: async () => ["r1", "r2"], eraseScope: note("run list") },
    records: { eraseScope: note("records") },
    blobs: { eraseAll: note("blobs") },
    eraseRunObject: async (runId) => {
      erased.push(`run ${runId}`);
    },
    eraseCoordination: note("coordination"),
    eraseRoutines: note("routines"),
    eraseUsage: async () => ({ unsent }),
  };
  return { stores, erased };
}

function ask(route: ReturnType<typeof deleteScopeRoutes>[number], query: string) {
  const url = `https://halonic.example.com/admin/scopes/delete${query}`;
  return route.handler(new Request(url, { method: "POST" }), env);
}

verifies("runtime.delete-scope", () => {
  describe("a scope's delete", () => {
    it("erases each run's object, then the other stores, and the run list last", async () => {
      const { stores, erased } = recordingStores();
      expect(await eraseScopeStores(stores)).toEqual({ runs: 2 });
      expect(erased).toEqual([
        "run r1",
        "run r2",
        "coordination",
        "routines",
        "blobs",
        "records",
        "run list",
      ]);
    });

    it("deletes the scope the route names, and refuses anything else before deleting", async () => {
      const removed: string[] = [];
      const [route] = deleteScopeRoutes(async (_env, scope: Scope) => {
        removed.push(scopeName(scope));
        return { runs: 3 };
      });
      if (route === undefined) throw new Error("The delete route is missing.");
      for (const query of ["", "?scope=", `?scope=${acme}/`, "?scope=x/org_acme0123456789abcdef"]) {
        const refused = await ask(route, query);
        expect(refused.status).toBe(400);
        expect(await refused.json()).toMatchObject({ code: "bad_scope" });
      }
      expect(removed).toEqual([]);
      const done = await ask(route, `?scope=${acme}`);
      expect(done.status).toBe(200);
      expect(done.headers.get("cache-control")).toBe("no-store");
      expect(await done.json()).toEqual({ deleted: { runs: 3 } });
      expect(removed).toEqual([scopeName(parseScope(acme) as Scope)]);
    });

    it("answers 503 for a deployment that isn't configured, and passes on any other failure", async () => {
      const [unready] = deleteScopeRoutes(async () => {
        throw new ConfigurationError(["DB"]);
      });
      const [broken] = deleteScopeRoutes(async () => {
        throw new TypeError("broken");
      });
      if (unready === undefined || broken === undefined) throw new Error("The route is missing.");
      expect((await ask(unready, `?scope=${acme}`)).status).toBe(503);
      await expect(ask(broken, `?scope=${acme}`)).rejects.toThrow(TypeError);
    });
  });
});

verifies("runtime.delete-scope-usage", () => {
  describe("a scope's delete with usage rows waiting", () => {
    it("erases nothing while usage rows wait for Cloud", async () => {
      const { stores, erased } = recordingStores(2);
      await expect(eraseScopeStores(stores)).rejects.toThrow(UsageUnsentError);
      expect(erased).toEqual([]);
    });

    it("answers 409 usage_unsent", async () => {
      const [route] = deleteScopeRoutes(async () => {
        throw new UsageUnsentError(2);
      });
      if (route === undefined) throw new Error("The delete route is missing.");
      const refused = await ask(route, `?scope=${acme}`);
      expect(refused.status).toBe(409);
      expect(await refused.json()).toMatchObject({ code: "usage_unsent" });
    });
  });
});
