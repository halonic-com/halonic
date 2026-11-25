import type { Coordination } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server } from "./api.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const publicHost = "engine.example.com";
const publicOrigin = `https://${publicHost}`;

function setup(options: { publicOrigin?: string; passwordHash?: string | null } = {}): Server {
  const clock = new TestClock();
  return testServer({
    passwordHash: options.passwordHash === undefined ? "hash:correct horse" : options.passwordHash,
    clock,
    passwordHasher: new FakePasswordHasher(),
    coordination: new FakeCoordination(clock) as unknown as Coordination,
    config: {
      allowedHosts: ["localhost:4747", publicHost],
      ...(options.publicOrigin === undefined ? {} : { publicOrigin: options.publicOrigin }),
    },
  });
}

/** A request as the Node listener hands it on: a plain `http://localhost` URL, whatever the proxy got. */
function plain(path: string, headers: Record<string, string>, init: RequestInit = {}): Request {
  return new Request(`http://localhost${path}`, { ...init, headers });
}

function login(server: Server, headers: Record<string, string>): Promise<Response> {
  return server.handle(
    plain(
      "/api/login",
      { "content-type": "application/json", ...headers },
      { method: "POST", body: JSON.stringify({ password: "correct horse" }) },
    ),
  );
}

describe("public endpoint", () => {
  verifies("server.public-endpoint", () => {
    it("answers its public name and refuses any other, loopback names included", async () => {
      const server = setup({ publicOrigin });
      const listed = await server.handle(plain("/api/hello", { host: publicHost }));
      expect(listed.status).toBe(200);
      for (const host of [
        "other.example.com",
        "localhost",
        "localhost:4747",
        "127.0.0.1",
        "127.0.0.1:4747",
        "[::1]",
      ]) {
        const refused = await server.handle(plain("/api/hello", { host }));
        expect(refused.status, host).toBe(421);
        expect(await refused.json()).toMatchObject({ code: "host_not_allowed" });
      }
    });

    it("answers nothing, its own name included, while no password is set", async () => {
      const server = setup({ publicOrigin, passwordHash: null });
      for (const host of [publicHost, "localhost", "127.0.0.1"]) {
        expect((await server.handle(plain("/api/hello", { host }))).status, host).toBe(421);
      }
    });

    it("treats a plain request as secure: HSTS and the __Host- cookie, whatever X-Forwarded-Proto says", async () => {
      const server = setup({ publicOrigin });
      for (const forwarded of [{}, { "x-forwarded-proto": "http" }]) {
        const response = await login(server, { host: publicHost, ...forwarded });
        expect(response.status).toBe(200);
        expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000");
        expect(response.headers.get("set-cookie")).toMatch(/^__Host-halonic-session=.*; Secure;/u);
      }
    });

    it("keeps the Origin check: its own https origin passes, the http one is refused", async () => {
      const server = setup({ publicOrigin });
      const own = await server.handle(
        plain("/api/hello", { host: publicHost, origin: publicOrigin }),
      );
      const http = await server.handle(
        plain("/api/hello", { host: publicHost, origin: `http://${publicHost}` }),
      );
      expect([own.status, http.status]).toEqual([200, 403]);
    });

    it("is refused at build when it isn't an https origin with no path", () => {
      for (const origin of ["http://engine.example.com", "https://engine.example.com/api", "x"]) {
        expect(() => setup({ publicOrigin: origin }), origin).toThrow(RangeError);
      }
    });
  });

  verifies("server.response-headers", () => {
    it("never reads X-Forwarded-Proto: a plain request to a server with no public origin stays plain", async () => {
      const server = setup();
      const response = await login(server, { host: publicHost, "x-forwarded-proto": "https" });
      expect(response.status).toBe(200);
      expect(response.headers.get("strict-transport-security")).toBeNull();
      expect(response.headers.get("set-cookie")).toMatch(/^halonic-session=/u);
    });
  });
});
