import type { Coordination } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RequestLogEntry, Server } from "./api.ts";
import { fakeClientId, fakeGoogle, fakeSecret, ledgerSubject } from "./google-fakes.test-helper.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const route = { app: "own", runsOn: "this-computer" } as const;
const lanHost = "lan.example:8080";

// Invented values. None is real.
const fakeCode = "fake-auth-code-0000000001";
const fakeState = "fake-state-0000000001";

function setup(options: { password?: boolean } = {}) {
  const clock = new TestClock();
  const google = fakeGoogle(clock);
  const requestLog: RequestLogEntry[] = [];
  const errors: unknown[] = [];
  const server: Server = testServer({
    passwordHash: options.password === true ? "hash:pw" : null,
    clock,
    passwordHasher: new FakePasswordHasher(),
    coordination: new FakeCoordination(clock) as unknown as Coordination,
    google,
    requestLog: { record: (entry) => requestLog.push(entry) },
    errorLog: { record: (cause) => errors.push(cause) },
    config: { allowedHosts: ["localhost", lanHost] },
  });
  return { server, google, requestLog, errors };
}

type Setup = ReturnType<typeof setup>;

/** A setup with a client ID and a saved secret, ready to sign in. */
async function readySetup({ google }: Setup): Promise<string> {
  const { accountRef } = await google.setups.start({ route, accountType: "personal" });
  await google.setups.update(accountRef, { kind: "client-id", clientId: fakeClientId });
  const clientRef = await google.clientSecrets.saveClientSecret(fakeSecret);
  await google.setups.update(accountRef, { kind: "client-secret-saved", clientRef });
  return accountRef;
}

function startSignIn(
  server: Server,
  accountRef: string,
  headers: Record<string, string> = {},
  origin = "http://localhost:4321",
): Promise<Response> {
  return server.handle(
    new Request(`${origin}/api/google/setups/${accountRef}/sign-in`, {
      method: "POST",
      headers: { host: new URL(origin).host, "sec-fetch-site": "same-origin", ...headers },
    }),
  );
}

/** Google's redirect: a plain navigation with no session and no site header a script could set. */
function callback(server: Server, query: string, headers: Record<string, string> = {}) {
  return server.handle(
    new Request(`http://localhost:4321/api/google/callback?${query}`, {
      headers: { host: "localhost:4321", ...headers },
    }),
  );
}

const codeQuery = `state=${fakeState}&code=${fakeCode}`;

/** Everything a test can see of what the server said and kept, to check a value isn't in it. */
function everythingSaid(
  texts: readonly string[],
  requestLog: readonly RequestLogEntry[],
  errors: readonly unknown[],
): string {
  return [
    ...texts,
    JSON.stringify(requestLog),
    ...errors.map((error) => `${String(error)} ${JSON.stringify(error)}`),
  ].join("\n");
}

describe("google sign-in start", () => {
  verifies("server.google-sign-in", () => {
    it("starts a sign-in that comes back to the server's own port and notes it on the record", async () => {
      const state = setup();
      const accountRef = await readySetup(state);

      const response = await startSignIn(state.server, accountRef);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ authUrl: state.google.actions.authUrl });
      const [started] = state.google.actions.signInStarts;
      expect(started).toMatchObject({
        accountRef,
        clientId: fakeClientId,
        redirect: { port: 4321, path: "/api/google/callback" },
        account: ledgerSubject.account,
      });
      expect((await state.google.setups.read(accountRef))?.signInStartedAt).not.toBeNull();
    });

    it("refuses a setup with no secret and a start that didn't come over a loopback name", async () => {
      const state = setup({ password: true });
      const { accountRef } = await state.google.setups.start({ route, accountType: "personal" });
      const loginResponse = await state.server.handle(
        new Request(`http://${lanHost}/api/login`, {
          method: "POST",
          headers: { host: lanHost, "content-type": "application/json" },
          body: JSON.stringify({ password: "pw" }),
        }),
      );
      const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0] ?? "";

      const lan = await startSignIn(state.server, accountRef, { cookie }, `http://${lanHost}`);
      const incomplete = await startSignIn(
        state.server,
        accountRef,
        { cookie },
        "http://localhost",
      );

      expect(lan.status).toBe(409);
      expect(((await lan.json()) as { code: string }).code).toBe("sign_in_needs_this_computer");
      expect(incomplete.status).toBe(409);
      expect(((await incomplete.json()) as { code: string }).code).toBe("google_setup_incomplete");
      expect(state.google.actions.signInStarts).toEqual([]);
    });

    it("needs the sign-in and the same site", async () => {
      const state = setup({ password: true });
      const accountRef = await readySetup(state);

      const loginResponse = await state.server.handle(
        new Request("http://localhost/api/login", {
          method: "POST",
          headers: { host: "localhost", "content-type": "application/json" },
          body: JSON.stringify({ password: "pw" }),
        }),
      );
      const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0] ?? "";

      const noSession = await startSignIn(state.server, accountRef, {}, "http://localhost");
      const otherSite = await startSignIn(
        state.server,
        accountRef,
        { cookie, "sec-fetch-site": "cross-site" },
        "http://localhost",
      );

      expect(noSession.status).toBe(401);
      expect(otherSite.status).toBe(403);
      expect(state.google.actions.signInStarts).toEqual([]);
    });

    it("answers 404 for a ref with no record", async () => {
      const state = setup();
      const response = await startSignIn(state.server, "not-a-ref");
      expect(response.status).toBe(404);
    });
  });
});

describe("google sign-in callback", () => {
  verifies("server.google-sign-in", () => {
    it("records a sign-in, tells the open item and answers a page with no code or state", async () => {
      const state = setup({ password: true });
      const accountRef = await readySetup(state);
      state.google.actions.signInOutcome = {
        kind: "signedIn",
        accountRef,
        services: [{ service: "ledger", result: { kind: "allowed" }, checkedAt: new Date() }],
      };

      const response = await callback(state.server, codeQuery);
      const page = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(state.google.actions.callbacks).toEqual([
        { state: fakeState, code: fakeCode, error: null },
      ]);
      const record = await state.google.setups.read(accountRef);
      expect(record?.lastSignInAt).not.toBeNull();
      expect(record?.services["ledger"]?.result).toEqual({ kind: "allowed" });
      expect(state.google.signedInEvents.map((event) => event.kind)).toEqual(["signedIn"]);
      const said = everythingSaid([page], state.requestLog, state.errors);
      expect(said).not.toContain(fakeCode);
      expect(said).not.toContain(fakeState);
      expect(state.requestLog).toEqual([
        { method: "GET", path: "/api/google/callback", status: 200 },
      ]);
    });

    it("drops the sign-in when Google was cancelled and says nothing was saved", async () => {
      const state = setup();
      const accountRef = await readySetup(state);
      await state.google.setups.update(accountRef, { kind: "sign-in-started" });
      state.google.actions.signInOutcome = { kind: "cancelled", accountRef };

      const response = await callback(state.server, `state=${fakeState}&error=access_denied`);

      expect(await response.text()).toContain("Nothing was saved");
      const record = await state.google.setups.read(accountRef);
      expect(record?.signInStartedAt).toBeNull();
      expect(record?.lastSignInAt).toBeNull();
    });

    it("gives the open item the address Google confirmed for another account, and the page no address", async () => {
      const state = setup();
      const accountRef = await readySetup(state);
      const otherAddress = "someone-else@example.com";
      state.google.actions.signInOutcome = {
        kind: "wrongAccount",
        accountRef,
        signedInAs: otherAddress,
      };

      const page = await (await callback(state.server, codeQuery)).text();

      expect(state.google.signedInEvents).toEqual([
        { kind: "wrongAccount", accountRef, signedInAs: otherAddress },
      ]);
      expect(page).not.toContain(otherAddress);
      expect((await state.google.setups.read(accountRef))?.lastSignInAt).toBeNull();
    });

    it("changes nothing for a link that is no longer valid", async () => {
      const state = setup();
      const accountRef = await readySetup(state);

      const response = await callback(state.server, "state=unknown&code=other");

      expect(await response.text()).toContain("no longer valid");
      expect((await state.google.setups.read(accountRef))?.signInStartedAt).toBeNull();
      expect(state.google.signedInEvents).toEqual([]);
    });

    it("still tells the open item how the sign-in ended when the record can't be updated", async () => {
      const state = setup();
      const accountRef = await readySetup(state);
      state.google.actions.signInOutcome = { kind: "cancelled", accountRef };
      state.google.setups.update = async () => {
        throw new Error("the setup is gone");
      };

      const response = await callback(state.server, `state=${fakeState}&error=access_denied`);

      expect(response.status).toBe(500);
      expect(state.google.signedInEvents).toEqual([{ kind: "cancelled", accountRef }]);
    });

    it("answers 404 for the callback when it didn't come over a loopback name", async () => {
      const state = setup({ password: true });
      const response = await state.server.handle(
        new Request(`http://${lanHost}/api/google/callback?${codeQuery}`, {
          headers: { host: lanHost },
        }),
      );

      expect(response.status).toBe(404);
      expect(state.google.actions.callbacks).toEqual([]);
    });

    it("keeps the code out of the log and the error log when the exchange throws", async () => {
      const state = setup();
      state.google.actions.finishSignIn = async () => {
        throw new Error("the token store failed");
      };

      const response = await callback(state.server, codeQuery);
      const said = everythingSaid([await response.text()], state.requestLog, state.errors);

      expect(response.status).toBe(500);
      expect(said).not.toContain(fakeCode);
      expect(said).not.toContain(fakeState);
    });

    it("answers 404 when the host has no Google ports", async () => {
      const server = testServer({ passwordHash: null });
      const response = await callback(server, codeQuery);
      expect(response.status).toBe(404);
    });
  });
});
