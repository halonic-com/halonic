import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** One request with exactly these headers: nothing is added, not even `Host`. */
export interface LaunchTokenRequest {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * A started server that only the program that launched it may call: the agent
 * host's, or the engine role's. It matches `launchRequestRefusal` in
 * `host/server`, which this suite can't import from the testing layer.
 */
export interface LaunchTokenServerUnderTest {
  /** This launch's token. */
  readonly token: string;
  /** The port the `Host` header must name. */
  readonly port: number;
  /** A GET path the server answers with 200 to a caller that passes every check. */
  readonly servedPath: string;
  /** Sends one request and answers its status. */
  send(request: LaunchTokenRequest): Promise<number>;
  close(): Promise<void>;
}

/** Starts a fresh server for each case. */
export interface LaunchTokenServerHarness {
  start(): Promise<LaunchTokenServerUnderTest>;
}

/** A path no launch-token server serves. */
const unknownPath = "/api/nothing-here";

type Server = LaunchTokenServerUnderTest;

/** A GET with exactly these headers, to the served path unless `path` names another. */
const get = (server: Server, headers: Record<string, string>, path = server.servedPath) =>
  server.send({ method: "GET", path, headers });
const own = (server: Server) => `127.0.0.1:${server.port}`;
const bearer = (server: Server) => `Bearer ${server.token}`;

/** Each case of the suite, by its title; each runs against a server of its own. */
const cases: Record<string, (server: Server) => Promise<void>> = {
  "serves a request with the token and its own host, as 127.0.0.1 or localhost": async (server) => {
    expect(await get(server, { host: own(server), authorization: bearer(server) })).toBe(200);
    const localhost = `localhost:${server.port}`;
    expect(await get(server, { host: localhost, authorization: bearer(server) })).toBe(200);
  },

  "refuses any other host with 421, even with the token": async (server) => {
    const others = [
      `attacker.example:${server.port}`,
      `127.0.0.1:${server.port + 1}`,
      "localhost",
      "127.0.0.1",
      `[::1]:${server.port}`,
    ];
    for (const host of others) {
      expect(await get(server, { host, authorization: bearer(server) }), host).toBe(421);
    }
  },

  "refuses any Origin with 403, its own address and null included": async (server) => {
    for (const origin of ["https://example.com", "null", `http://${own(server)}`]) {
      const headers = { host: own(server), origin, authorization: bearer(server) };
      expect(await get(server, headers), origin).toBe(403);
    }
  },

  "refuses a missing, wrong or near-miss token with 401": async (server) => {
    const { token } = server;
    const wrong = [
      `Bearer ${token.slice(0, -1)}`,
      `Bearer ${token}x`,
      `Bearer ${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`,
      `bearer ${token}`,
      `Bearer  ${token}`,
      token,
      "Bearer ",
    ];
    expect(await get(server, { host: own(server) })).toBe(401);
    for (const authorization of wrong) {
      expect(await get(server, { host: own(server), authorization }), authorization).toBe(401);
    }
  },

  "answers an unknown path 401 without the token, and 404 only with it": async (server) => {
    const host = own(server);
    expect(await get(server, { host }, unknownPath)).toBe(401);
    expect(await server.send({ method: "POST", path: unknownPath, headers: { host } })).toBe(401);
    expect(await get(server, { host, authorization: bearer(server) }, unknownPath)).toBe(404);
  },

  "checks the host first, then the origin, then the token": async (server) => {
    const origin = "https://example.com";
    const rebound = { host: `attacker.example:${server.port}`, origin };
    expect(await get(server, rebound, unknownPath)).toBe(421);
    expect(await get(server, { host: own(server), origin }, unknownPath)).toBe(403);
  },
};

/**
 * The refusals every launch-token server gives, before it looks at the path
 * (security review on HAL-14212, section 1): wrong `Host` 421, any `Origin`
 * 403, a missing, wrong or near-miss token 401, so an unknown path without
 * the token gives 401, not 404.
 */
export function launchTokenRefusalContract(name: string, harness: LaunchTokenServerHarness): void {
  verifies("contracts.launch-token-refusal", () => {
    describe(`launch-token refusals: ${name}`, () => {
      for (const [title, check] of Object.entries(cases)) {
        it(title, async () => {
          const server = await harness.start();
          try {
            await check(server);
          } finally {
            await server.close();
          }
        });
      }
    });
  });
}
