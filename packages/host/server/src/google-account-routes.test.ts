import { refreshTokenName } from "@halonicjs/google-setup";
import type { Coordination } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RequestLogEntry, Server } from "./api.ts";
import {
  fakeClientId,
  fakeGoogle,
  fakeSecret,
  ledgerSubject,
  otherFakeSecret,
} from "./google-fakes.test-helper.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const route = { app: "own", runsOn: "this-computer" } as const;
const fakeRefreshToken = "fake-refresh-token-0000000001";

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
    config: { allowedHosts: ["localhost"] },
  });
  return { server, google, requestLog, errors };
}

type Setup = ReturnType<typeof setup>;

/** A setup that has a client ID, a saved secret and a refresh token: one that signed in. */
async function signedInSetup(
  { google }: Setup,
  secret = fakeSecret,
): Promise<{ accountRef: string; clientRef: string }> {
  const { accountRef } = await google.setups.start({ route, accountType: "personal" });
  await google.setups.update(accountRef, { kind: "client-id", clientId: fakeClientId });
  const clientRef = await google.clientSecrets.saveClientSecret(secret);
  await google.setups.update(accountRef, { kind: "client-secret-saved", clientRef });
  await google.setups.update(accountRef, { kind: "signed-in" });
  await google.tokens.set(refreshTokenName(accountRef), fakeRefreshToken);
  return { accountRef, clientRef };
}

/** A second account on the same client, as if it used the first one's app. */
async function accountOnSameClient({ google }: Setup, clientRef: string): Promise<string> {
  const { accountRef } = await google.setups.start({ route, accountType: "personal" });
  await google.setups.update(accountRef, { kind: "client-id", clientId: fakeClientId });
  await google.setups.update(accountRef, { kind: "client-secret-saved", clientRef });
  return accountRef;
}

function send(
  server: Server,
  method: string,
  path: string,
  options: { body?: string; headers?: Record<string, string> } = {},
): Promise<Response> {
  return server.handle(
    new Request(`http://localhost/api/google/setups/${path}`, {
      method,
      headers: {
        host: "localhost",
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
        ...options.headers,
      },
      ...(options.body === undefined ? {} : { body: options.body }),
    }),
  );
}

const stage = (server: Server, accountRef: string, clientSecret: string): Promise<Response> =>
  send(server, "PUT", `${accountRef}/secret/staged`, { body: JSON.stringify({ clientSecret }) });

const secretsInStore = (setup: Setup): string[] => [...setup.google.tokens.values.values()];

describe("google staged client secret", () => {
  verifies("server.google-staged-secret", () => {
    it("keeps a staged secret apart and leaves the secret in use alone", async () => {
      const state = setup();
      const { accountRef, clientRef } = await signedInSetup(state);

      const response = await stage(state.server, accountRef, otherFakeSecret);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ staged: true });
      expect(await state.google.clientSecrets.readClientSecret(clientRef)).toBe(fakeSecret);
      expect(await state.google.clientSecrets.readStagedClientSecret(clientRef)).toBe(
        otherFakeSecret,
      );
    });

    it("asks for the secret to be saved first, and sends a setup that never signed in to the plain save", async () => {
      const state = setup();
      const { accountRef: bare } = await state.google.setups.start({
        route,
        accountType: "personal",
      });
      expect((await stage(state.server, bare, otherFakeSecret)).status).toBe(409);
      expect(await (await stage(state.server, bare, otherFakeSecret)).json()).toMatchObject({
        code: "secret_not_saved",
      });

      const clientRef = await state.google.clientSecrets.saveClientSecret(fakeSecret);
      await state.google.setups.update(bare, { kind: "client-secret-saved", clientRef });
      const response = await stage(state.server, bare, otherFakeSecret);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: "secret_needs_no_staging" });
    });

    it("promotes a staged secret Google accepts, and clears the client refusal of every account on the client", async () => {
      const state = setup();
      const { accountRef, clientRef } = await signedInSetup(state);
      const second = await accountOnSameClient(state, clientRef);
      await state.google.setups.refreshRefused(accountRef, { kind: "clientRefused" });
      await stage(state.server, accountRef, otherFakeSecret);
      state.google.actions.stagedOutcome = { kind: "accepted" };

      const response = await send(state.server, "POST", `${accountRef}/secret/staged/check`);

      expect(await response.json()).toEqual({
        result: "accepted",
        accountsFixed: expect.arrayContaining([accountRef, second]),
      });
      expect(await state.google.clientSecrets.readClientSecret(clientRef)).toBe(otherFakeSecret);
      expect(await state.google.clientSecrets.readStagedClientSecret(clientRef)).toBeNull();
      expect((await state.google.setups.read(second))?.refreshRefused).toBeNull();
    });

    it("discards a staged secret Google refuses and marks nobody when the old secret was never refused", async () => {
      const state = setup();
      const { accountRef, clientRef } = await signedInSetup(state);
      await stage(state.server, accountRef, otherFakeSecret);
      state.google.actions.stagedOutcome = { kind: "refused" };

      const response = await send(state.server, "POST", `${accountRef}/secret/staged/check`);

      expect(await response.json()).toEqual({ result: "refused" });
      expect(await state.google.clientSecrets.readClientSecret(clientRef)).toBe(fakeSecret);
      expect(await state.google.clientSecrets.readStagedClientSecret(clientRef)).toBeNull();
      expect((await state.google.setups.read(accountRef))?.refreshRefused).toBeNull();
    });

    it("marks the client gone when a new secret is refused after the old one was", async () => {
      const state = setup();
      const { accountRef } = await signedInSetup(state);
      await state.google.setups.refreshRefused(accountRef, { kind: "clientRefused" });
      await stage(state.server, accountRef, otherFakeSecret);
      state.google.actions.stagedOutcome = { kind: "refused" };

      await send(state.server, "POST", `${accountRef}/secret/staged/check`);

      expect((await state.google.setups.read(accountRef))?.refreshRefused?.reason).toBe(
        "client-gone",
      );
    });

    it("saves a refused refresh token and keeps the staged secret for another try", async () => {
      const state = setup();
      const { accountRef, clientRef } = await signedInSetup(state);
      await stage(state.server, accountRef, otherFakeSecret);
      state.google.actions.stagedOutcome = { kind: "signInRefused" };

      const response = await send(state.server, "POST", `${accountRef}/secret/staged/check`);

      expect(await response.json()).toEqual({ result: "signInRefused" });
      expect((await state.google.setups.read(accountRef))?.refreshRefused?.reason).toBe("sign-in");
      expect(await state.google.clientSecrets.readStagedClientSecret(clientRef)).toBe(
        otherFakeSecret,
      );
    });

    it("changes nothing when Google can't be reached", async () => {
      const state = setup();
      const { accountRef, clientRef } = await signedInSetup(state);
      await stage(state.server, accountRef, otherFakeSecret);
      state.google.actions.stagedOutcome = { kind: "unreachable" };

      const response = await send(state.server, "POST", `${accountRef}/secret/staged/check`);

      expect(await response.json()).toEqual({ result: "unreachable" });
      expect(await state.google.clientSecrets.readClientSecret(clientRef)).toBe(fakeSecret);
      expect(await state.google.clientSecrets.readStagedClientSecret(clientRef)).toBe(
        otherFakeSecret,
      );
    });

    it("tests a shared client's staged secret with the token of the account that signed in", async () => {
      const state = setup();
      const { accountRef, clientRef } = await signedInSetup(state);
      const second = await accountOnSameClient(state, clientRef);
      await stage(state.server, second, otherFakeSecret);
      state.google.actions.stagedOutcome = { kind: "accepted" };

      const response = await send(state.server, "POST", `${second}/secret/staged/check`);

      expect(await response.json()).toMatchObject({ result: "accepted" });
      expect(state.google.actions.stagedChecks.map((check) => check.accountRef)).toEqual([
        accountRef,
      ]);
    });

    it("drops a staged secret on request and keeps the one in use", async () => {
      const state = setup();
      const { accountRef, clientRef } = await signedInSetup(state);
      await stage(state.server, accountRef, otherFakeSecret);

      const response = await send(state.server, "DELETE", `${accountRef}/secret/staged`);

      expect(await response.json()).toEqual({ discarded: true });
      expect(secretsInStore(state)).toContain(fakeSecret);
      expect(await state.google.clientSecrets.readStagedClientSecret(clientRef)).toBeNull();
    });

    it("needs the sign-in, the same site and, to stage, a JSON body", async () => {
      const state = setup({ password: true });
      const { accountRef } = await signedInSetup(state);
      expect((await stage(state.server, accountRef, otherFakeSecret)).status).toBe(401);

      const open = setup();
      const ready = await signedInSetup(open);
      const crossSite = { headers: { "sec-fetch-site": "cross-site" } };
      expect(
        (await send(open.server, "POST", `${ready.accountRef}/secret/staged/check`, crossSite))
          .status,
      ).toBe(403);
      expect(
        (await send(open.server, "DELETE", `${ready.accountRef}/secret/staged`, crossSite)).status,
      ).toBe(403);
      const text = await send(open.server, "PUT", `${ready.accountRef}/secret/staged`, {
        body: JSON.stringify({ clientSecret: otherFakeSecret }),
        headers: { "content-type": "text/plain" },
      });
      expect(text.status).toBe(415);
      expect(await open.google.clientSecrets.readStagedClientSecret(ready.clientRef)).toBeNull();
    });

    it("leaves a good and a bad secret out of every answer, log line and error, and out of the request log", async () => {
      const state = setup();
      const { accountRef } = await signedInSetup(state);
      const said: string[] = [];
      const rounds = [
        { secret: otherFakeSecret, outcome: { kind: "accepted" } },
        { secret: "fake-client-secret-0000000009", outcome: { kind: "refused" } },
      ] as const;
      for (const { secret, outcome } of rounds) {
        state.google.actions.stagedOutcome = outcome;
        said.push(await (await stage(state.server, accountRef, secret)).text());
        said.push(
          await (await send(state.server, "POST", `${accountRef}/secret/staged/check`)).text(),
        );
      }
      said.push(await (await send(state.server, "GET", accountRef)).text());
      said.push(JSON.stringify(state.requestLog));
      said.push(...state.errors.map((error) => `${String(error)} ${JSON.stringify(error)}`));
      const everything = said.join("\n");

      for (const value of [
        otherFakeSecret,
        "fake-client-secret-0000000009",
        fakeSecret,
        fakeRefreshToken,
      ]) {
        expect(everything).not.toContain(value);
      }
      expect(state.requestLog.map((entry) => entry.path)).toEqual([
        `/api/google/setups/${accountRef}`,
      ]);
    });
  });
});

describe("google check again and disconnect", () => {
  verifies("server.google-account-actions", () => {
    it("checks the services again and saves each result on the record", async () => {
      const state = setup();
      const { accountRef } = await signedInSetup(state);
      state.google.actions.checkOutcome = {
        kind: "checked",
        services: [{ service: "ledger", result: { kind: "allowed" }, checkedAt: new Date() }],
      };

      const response = await send(state.server, "POST", `${accountRef}/check`);
      const answer = (await response.json()) as { result: string; services: { service: string }[] };

      expect(answer.result).toBe("checked");
      expect(answer.services.map((service) => service.service)).toEqual(["ledger"]);
      expect((await state.google.setups.read(accountRef))?.services["ledger"]?.result).toEqual({
        kind: "allowed",
      });
    });

    it("hands Google's side the record's client and services, and no secret", async () => {
      const state = setup();
      const { accountRef, clientRef } = await signedInSetup(state);

      await send(state.server, "POST", `${accountRef}/check`);

      expect(state.google.actions.checks).toEqual([
        {
          accountRef,
          clientId: fakeClientId,
          clientRef,
          services: ledgerSubject.services,
          refreshRefused: null,
        },
      ]);
      expect(JSON.stringify(state.google.actions.checks)).not.toContain(fakeSecret);
    });

    it("saves a refused refresh token on the record, so the next check sees it", async () => {
      const state = setup();
      const { accountRef } = await signedInSetup(state);
      state.google.actions.checkOutcome = { kind: "signInRefused" };

      const response = await send(state.server, "POST", `${accountRef}/check`);
      await send(state.server, "POST", `${accountRef}/check`);

      expect(await response.json()).toEqual({ result: "signInRefused" });
      expect(state.google.actions.checks[1]?.refreshRefused?.reason).toBe("sign-in");
    });

    it("saves a refused client secret and marks every account on the client", async () => {
      const state = setup();
      const { accountRef, clientRef } = await signedInSetup(state);
      const second = await accountOnSameClient(state, clientRef);
      state.google.actions.checkOutcome = { kind: "clientRefused" };

      await send(state.server, "POST", `${accountRef}/check`);

      expect((await state.google.setups.read(second))?.refreshRefused?.reason).toBe("client");
    });

    it("answers the other outcomes by their word and changes nothing", async () => {
      const state = setup();
      const { accountRef } = await signedInSetup(state);
      state.google.actions.checkOutcome = { kind: "unreachable" };

      const response = await send(state.server, "POST", `${accountRef}/check`);

      expect(await response.json()).toEqual({ kind: "unreachable" });
      expect((await state.google.setups.read(accountRef))?.refreshRefused).toBeNull();
    });

    it("refuses a check of a setup without a client ID and secret", async () => {
      const state = setup();
      const { accountRef } = await state.google.setups.start({ route, accountType: "personal" });

      const response = await send(state.server, "POST", `${accountRef}/check`);

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: "google_setup_incomplete" });
      expect(state.google.actions.checks).toEqual([]);
    });

    it("revokes the token, then removes the token, the record and the secret", async () => {
      const state = setup();
      const { accountRef, clientRef } = await signedInSetup(state);

      const response = await send(state.server, "POST", `${accountRef}/disconnect`);

      expect(await response.json()).toEqual({
        disconnected: true,
        googleConfirmed: true,
        clientSecret: "removed",
      });
      expect(state.google.actions.revoked).toEqual([accountRef]);
      expect(await state.google.setups.read(accountRef)).toBeNull();
      expect(await state.google.clientSecrets.readClientSecret(clientRef)).toBeNull();
      expect(secretsInStore(state)).toEqual([]);
    });

    it("removes everything when Google didn't confirm, and says so", async () => {
      const state = setup();
      const { accountRef } = await signedInSetup(state);
      state.google.actions.revokeConfirmed = false;

      const response = await send(state.server, "POST", `${accountRef}/disconnect`);

      expect(await response.json()).toMatchObject({ disconnected: true, googleConfirmed: false });
      expect(secretsInStore(state)).toEqual([]);
    });

    it("keeps the client secret while another account uses the client", async () => {
      const state = setup();
      const { accountRef, clientRef } = await signedInSetup(state);
      const second = await accountOnSameClient(state, clientRef);

      const response = await send(state.server, "POST", `${accountRef}/disconnect`);

      expect(await response.json()).toMatchObject({ clientSecret: "kept-for-other-accounts" });
      expect(await state.google.clientSecrets.readClientSecret(clientRef)).toBe(fakeSecret);
      expect(await state.google.setups.read(second)).not.toBeNull();
    });

    it("answers 404 for a setup that doesn't exist, and 401 without the sign-in", async () => {
      const state = setup();
      const missing = await send(state.server, "POST", "gaccount_missing1/disconnect");
      expect(missing.status).toBe(404);

      const locked = setup({ password: true });
      const { accountRef } = await signedInSetup(locked);
      expect((await send(locked.server, "POST", `${accountRef}/disconnect`)).status).toBe(401);
      expect((await send(locked.server, "POST", `${accountRef}/check`)).status).toBe(401);
    });

    it("refuses a request from another site", async () => {
      const state = setup();
      const { accountRef } = await signedInSetup(state);
      const crossSite = { headers: { "sec-fetch-site": "cross-site" } };

      expect((await send(state.server, "POST", `${accountRef}/disconnect`, crossSite)).status).toBe(
        403,
      );
      expect((await send(state.server, "POST", `${accountRef}/check`, crossSite)).status).toBe(403);
      expect(state.google.actions.revoked).toEqual([]);
      expect(state.google.actions.checks).toEqual([]);
      expect(await state.google.setups.read(accountRef)).not.toBeNull();
    });

    it("logs the path of these requests and nothing else", async () => {
      const state = setup();
      const { accountRef } = await signedInSetup(state);

      await send(state.server, "POST", `${accountRef}/check`);
      await send(state.server, "POST", `${accountRef}/disconnect`);

      expect(state.requestLog).toEqual([
        { method: "POST", path: `/api/google/setups/${accountRef}/check`, status: 200 },
        { method: "POST", path: `/api/google/setups/${accountRef}/disconnect`, status: 200 },
      ]);
    });
  });
});
