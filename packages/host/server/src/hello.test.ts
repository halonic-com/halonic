import { type RunExecutor, type RunStore, runExecutorVersion } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { minStudioVersion } from "./hello-route.ts";
import { memoryRunOwnership } from "./memory-run-ownership.test-helper.ts";
import { ids, personalClaims, StubSessionVerifier } from "./stub-session-verifier.test-helper.ts";
import { testServer, unusedPort } from "./test-server.ts";

const host = "halonic.acme.example";

describe("hello", () => {
  verifies("server.hello", () => {
    it("answers exactly six keys without a session, even when a password is set", async () => {
      const server = testServer({
        passwordHash: "hash",
        config: { version: "1.2.3", minAppVersion: "1.0.0" },
      });
      const response = await server.handle(
        new Request(`https://${host}/api/hello`, { headers: { host } }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        product: "halonic",
        version: "1.2.3",
        minAppVersion: "1.0.0",
        runExecutorVersion,
        mode: "owner",
        minStudioVersion,
      });
    });

    it("names a many-user server's mode, so Studio can refuse it", async () => {
      const server = testServer({
        passwordHash: null,
        config: { allowedHosts: [host], version: "1.2.3", minAppVersion: "1.0.0" },
        manyUsers: {
          verifier: new StubSessionVerifier({ "alice-token": personalClaims(ids.alice) }),
          cookieName: "acme-session",
          scopedRuns: () => ({
            runs: unusedPort("the scoped runs") as RunExecutor,
            runStore: unusedPort("the scoped run store") as Pick<RunStore, "list" | "get">,
            ownership: memoryRunOwnership(),
          }),
        },
      });
      const response = await server.handle(
        new Request(`https://${host}/api/hello`, { headers: { host } }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        product: "halonic",
        version: "1.2.3",
        minAppVersion: "1.0.0",
        runExecutorVersion,
        mode: "many",
        minStudioVersion,
      });
    });

    it("keeps the oldest Studio a fixed floor, not the server's own version", async () => {
      const server = testServer({ passwordHash: "hash", config: { version: "9.9.9" } });
      const response = await server.handle(
        new Request(`https://${host}/api/hello`, { headers: { host } }),
      );
      expect(await response.json()).toMatchObject({ minStudioVersion: "0.1.0" });
    });

    it("is refused on a foreign Host by a server with no password", async () => {
      const server = testServer({ passwordHash: null });
      const response = await server.handle(
        new Request("http://evil.example/api/hello", { headers: { host: "evil.example" } }),
      );
      expect(response.status).toBe(421);
    });
  });
});
