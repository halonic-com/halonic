import { checkClaims, type Principal } from "@halonicjs/host-server";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ConfigurationError, type RuntimeEnv } from "./env.ts";
import { runtimeOptionsOfNamePrefix, scopeOfNamePrefix } from "./runtime.ts";
import { createScopedRuns, scopedRuntime } from "./scoped-runtime.ts";

// The adapters only keep their bindings until a call; these stand in for the real ones.
const namedObjects: string[] = [];
const namespace = {
  idFromName: (name: string) => {
    namedObjects.push(name);
    return name;
  },
  get: () => ({}),
};
const env = {
  COORDINATION: namespace,
  RUN: namespace,
  ROUTINES: namespace,
  DB: {},
  BLOBS: {},
  DEFINITIONS: {},
  HALONIC_SECRET_TOKEN_KEY: "a-secret-value",
  HALONIC_SECRET_SERVE_PASSWORD: "another-secret-value",
} as unknown as RuntimeEnv;

/** The principal of a made-up personal scope. */
function acmePrincipal(): Principal {
  const session = checkClaims({
    aud: "app",
    sub: "eu_acme0000000000001",
    scope: "u/eu_acme0000000000001",
  });
  if (session === null) throw new Error("The test's claims were refused.");
  return session.principal;
}

verifies("runtime.scoped-runtime", () => {
  describe("a scope's runtime in Node", () => {
    it("names the scope's routines object after the scope", () => {
      namedObjects.length = 0;
      scopedRuntime(env, acmePrincipal().scope);
      expect(namedObjects).toContain("u/eu_acme0000000000001");
    });

    it("gives each principal the run ports of its scope's runtime", async () => {
      const scopedRuns = await createScopedRuns(env);
      const ports = scopedRuns(acmePrincipal());
      expect(ports.runs.id).toBe("cloudflare-worker");
      expect(ports.runStore).toBeDefined();
    });

    it("refuses a deployment that lacks a binding before any request", async () => {
      const { BLOBS: _left, ...withoutBlobs } = env;
      await expect(createScopedRuns(withoutBlobs as RuntimeEnv)).rejects.toThrow(
        ConfigurationError,
      );
    });

    it("reads a run object's scope from its name prefix", () => {
      expect(scopeOfNamePrefix("u/eu_acme0000000000001/")).toBe("u/eu_acme0000000000001");
      expect(scopeOfNamePrefix("")).toBeUndefined();
      expect(scopeOfNamePrefix(null)).toBeUndefined();
    });

    it("builds a scoped run object's runtime with the deployment's definitions", () => {
      expect(runtimeOptionsOfNamePrefix("o/org_acme0000000000001/")).toEqual({
        scope: "o/org_acme0000000000001",
        sharedDefinitions: true,
      });
      expect(runtimeOptionsOfNamePrefix(null)).toEqual({});
    });
  });
});
