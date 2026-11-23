import type { Coordination } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server } from "./api.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const host = "halonic.acme.example";

function ownerServer(passwordHash: string | null): Server {
  const clock = new TestClock();
  return testServer({
    passwordHash,
    clock,
    passwordHasher: new FakePasswordHasher(),
    coordination: new FakeCoordination(clock) as unknown as Coordination,
    config: { allowedHosts: [host], maxBodyBytes: 4096 },
  });
}

function get(server: Server, path: string, headers: Record<string, string> = {}, name = host) {
  return server.handle(
    new Request(`https://${name}${path}`, { headers: { host: name, ...headers } }),
  );
}

describe("owner's server", () => {
  verifies("server.owner-mode", () => {
    it("signs the owner in with the password, as before", async () => {
      const server = ownerServer("hash:correct horse");
      const login = await server.handle(
        new Request(`https://${host}/api/login`, {
          method: "POST",
          headers: { host, "content-type": "application/json" },
          body: JSON.stringify({ password: "correct horse" }),
        }),
      );
      expect(login.status).toBe(200);
      const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
      const session = await get(server, "/api/session", { cookie });
      expect(session.status).toBe(200);
      expect(await session.json()).toEqual({ signedIn: true });
    });

    it("signs nobody in with a session token, as a bearer token or a cookie", async () => {
      const server = ownerServer("hash:correct horse");
      for (const headers of [
        { authorization: "Bearer alice-token" },
        { cookie: "acme-session=alice-token" },
      ]) {
        expect((await get(server, "/api/session", headers)).status).toBe(401);
      }
    });

    it("answers only loopback names when no password is set", async () => {
      const server = ownerServer(null);
      expect((await get(server, "/api/session", {}, host)).status).toBe(421);
      expect((await get(server, "/api/session", {}, "localhost")).status).toBe(200);
    });
  });
});
