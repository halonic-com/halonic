import type { Coordination } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server } from "./api.ts";
import { fakeGoogle, fakeSecret } from "./google-fakes.test-helper.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const route = { app: "own", runsOn: "this-computer" } as const;

/** An invented connector for the setups these tests start. */
const connector = { workspace: "0123456789abcdef0123456789abcdef", id: "gmail" };

const lanHost = "lan.example:8080";

/** A server with no password, which counts every session as signed in; with `password`, it needs a session and answers to a LAN name too. */
function setup(options: { password?: boolean } = {}) {
  const clock = new TestClock();
  const google = fakeGoogle(clock);
  const server: Server = testServer({
    passwordHash: options.password === true ? "hash:pw" : null,
    clock,
    passwordHasher: new FakePasswordHasher(),
    coordination: new FakeCoordination(clock) as unknown as Coordination,
    google,
    config: { allowedHosts: ["localhost", lanHost] },
  });
  return { server, google };
}

/** Signs in over the LAN name and returns the session cookie as a request header. */
async function signInOverLan(server: Server): Promise<Record<string, string>> {
  const response = await server.handle(
    new Request(`http://${lanHost}/api/login`, {
      method: "POST",
      headers: { host: lanHost, "content-type": "application/json" },
      body: JSON.stringify({ password: "pw" }),
    }),
  );
  return { cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

function get(server: Server, path: string): Promise<Response> {
  return server.handle(new Request(`http://localhost${path}`, { headers: { host: "localhost" } }));
}

function putSecret(server: Server, accountRef: string, clientSecret: string): Promise<Response> {
  return server.handle(
    new Request(`http://localhost/api/google/setups/${accountRef}/secret`, {
      method: "PUT",
      headers: {
        host: "localhost",
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({ clientSecret }),
    }),
  );
}

describe("google setup list", () => {
  verifies("server.google-setup-list", () => {
    const started = (google: ReturnType<typeof fakeGoogle>) =>
      google.setups.start({ route, accountType: "personal", connector });

    async function list(
      server: Server,
      options: { address?: string; host?: string } = {},
    ): Promise<Response> {
      const host = options.host ?? "localhost";
      return server.handle(
        new Request(`http://${host}/api/google/setups`, { headers: { host } }),
        options.address === undefined ? {} : { clientAddress: options.address },
      );
    }

    it("lists the setups as the single read shows them, with where the browser is", async () => {
      const { server, google } = setup();
      const { accountRef } = await started(google);
      const one = await (await get(server, `/api/google/setups/${accountRef}`)).json();

      const response = await list(server, { address: "127.0.0.1" });
      const body = (await response.json()) as { signIn: string; setups: unknown[] };

      expect(response.status).toBe(200);
      expect(body.signIn).toBe("here");
      expect(body.setups).toEqual([one]);
    });

    it("gives each entry the address and services a window needs to draw it", async () => {
      const { server, google } = setup();
      await started(google);
      const body = (await (await list(server)).json()) as {
        setups: { account: string; available: { id: string }[]; route: unknown }[];
      };
      expect(body.setups[0]?.account).toBe("someone@example.com");
      expect(body.setups[0]?.available.map(({ id }) => id)).toEqual(["ledger"]);
      expect(body.setups[0]?.route).toEqual(route);
    });

    it("leaves out a setup no connector uses any more", async () => {
      const { server, google } = setup();
      await started(google);
      google.source.describe = async () => null;
      const body = (await (await list(server)).json()) as { setups: unknown[] };
      expect(body.setups).toEqual([]);
    });

    it.each([
      ["another computer", { address: "192.168.1.20" }],
      ["no address", {}],
    ])("says elsewhere for %s that calls the server localhost", async (_name, options) => {
      const { server } = setup();
      const response = await list(server, options);
      expect(((await response.json()) as { signIn: string }).signIn).toBe("elsewhere");
    });

    it("says elsewhere for a tunnel, which reaches the server from loopback under its own name", async () => {
      const { server } = setup({ password: true });
      const cookie = await signInOverLan(server);
      const response = await server.handle(
        new Request(`http://${lanHost}/api/google/setups`, {
          headers: { host: lanHost, ...cookie },
        }),
        { clientAddress: "127.0.0.1" },
      );
      expect(response.status).toBe(200);
      expect(((await response.json()) as { signIn: string }).signIn).toBe("elsewhere");
    });

    it("needs the sign-in on a server with a password", async () => {
      const { server } = setup({ password: true });
      expect((await list(server, { address: "127.0.0.1", host: lanHost })).status).toBe(401);
    });

    it("holds no secret and no client ref", async () => {
      const { server, google } = setup();
      const { accountRef } = await started(google);
      expect((await putSecret(server, accountRef, fakeSecret)).status).toBe(200);
      const text = await (await list(server)).text();
      expect(text).not.toContain(fakeSecret);
      expect(text).not.toContain("gclient");
    });

    it("answers only the two reads when the host passes read ports alone", async () => {
      const clock = new TestClock();
      const google = fakeGoogle(clock);
      const server = testServer({
        passwordHash: null,
        clock,
        googleRead: { setups: google.setups, source: google.source },
      });
      const { accountRef } = await started(google);
      expect((await get(server, "/api/google/setups")).status).toBe(200);
      expect((await get(server, `/api/google/setups/${accountRef}`)).status).toBe(200);

      const post = await server.handle(
        new Request("http://localhost/api/google/setups", {
          method: "POST",
          headers: { host: "localhost", "content-type": "application/json" },
          body: "{}",
        }),
      );
      expect(post.status).toBe(404);
      for (const path of [
        `/api/google/setups/${accountRef}/sign-in`,
        `/api/google/setups/${accountRef}/secret`,
        "/api/google/setups/a/b/c",
        "/api/google/callback",
        "/api/google/",
      ]) {
        const response = await get(server, path);
        expect(response.status, path).toBe(404);
        expect(await response.json(), path).toMatchObject({ code: "not_found" });
      }
    });
  });
});
