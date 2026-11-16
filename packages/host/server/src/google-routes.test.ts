import type { Coordination } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RequestLogEntry, Server } from "./api.ts";
import {
  fakeGoogle,
  fakeSecret,
  ledgerSubject,
  otherFakeSecret,
} from "./google-fakes.test-helper.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const route = { app: "own", runsOn: "this-computer" } as const;

/** An invented connector for the setups these tests start. */
const connector = { workspace: "0123456789abcdef0123456789abcdef", id: "gmail" };

const lanHost = "lan.example:8080";

/**
 * A server with no password, which answers on loopback names and counts every
 * session as signed in. With `password`, a session is needed, and the server
 * also answers to a LAN name over plain http.
 */
function setup(options: { password?: boolean; withGoogle?: boolean } = {}) {
  const clock = new TestClock();
  const google = fakeGoogle(clock);
  const requestLog: RequestLogEntry[] = [];
  const errors: unknown[] = [];
  const server: Server = testServer({
    passwordHash: options.password === true ? "hash:pw" : null,
    clock,
    passwordHasher: new FakePasswordHasher(),
    coordination: new FakeCoordination(clock) as unknown as Coordination,
    ...(options.withGoogle === false ? {} : { google }),
    requestLog: { record: (entry) => requestLog.push(entry) },
    errorLog: { record: (cause) => errors.push(cause) },
    config: { allowedHosts: ["localhost", lanHost] },
  });
  return { server, google, requestLog, errors };
}

/** Signs in over the LAN name and returns the session cookie as a request header. */
async function signInOverLan(
  server: Server,
  context: { secure?: boolean } = {},
): Promise<Record<string, string>> {
  const response = await server.handle(
    new Request(`http://${lanHost}/api/login`, {
      method: "POST",
      headers: { host: lanHost, "content-type": "application/json" },
      body: JSON.stringify({ password: "pw" }),
    }),
    context,
  );
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  return { cookie };
}

function get(server: Server, path: string): Promise<Response> {
  return server.handle(new Request(`http://localhost${path}`, { headers: { host: "localhost" } }));
}

function putSecret(
  server: Server,
  accountRef: string,
  body: string,
  headers: Record<string, string> = {},
  url = "http://localhost",
): Promise<Response> {
  return server.handle(
    new Request(`${url}/api/google/setups/${accountRef}/secret`, {
      method: "PUT",
      headers: {
        host: new URL(url).host,
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
        ...headers,
      },
      body,
    }),
  );
}

const secretBody = (clientSecret: string): string => JSON.stringify({ clientSecret });

/** Everything a test can see of what the server said and kept, to check a value isn't in it. */
function everythingSaid(
  responses: readonly string[],
  requestLog: readonly RequestLogEntry[],
  errors: readonly unknown[],
): string {
  return [
    ...responses,
    JSON.stringify(requestLog),
    ...errors.map((error) => `${String(error)} ${JSON.stringify(error)}`),
  ].join("\n");
}

describe("google setup state", () => {
  verifies("server.google-setup", () => {
    it("shows the progress and the steps, with no secret and no client ref", async () => {
      const { server, google } = setup();
      const { accountRef } = await google.setups.start({
        route,
        accountType: "personal",
        connector,
      });
      expect((await putSecret(server, accountRef, secretBody(fakeSecret))).status).toBe(200);

      const response = await get(server, `/api/google/setups/${accountRef}`);
      const text = await response.text();
      const shown = JSON.parse(text) as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(shown["accountRef"]).toBe(accountRef);
      expect(shown["clientSecretSavedAt"]).toEqual(expect.any(String));
      expect((shown["steps"] as { steps: { id: string }[] }).steps.map((step) => step.id)).toEqual(
        expect.arrayContaining(["project", "apis", "credentials", "sign-in"]),
      );
      expect(text).toContain(ledgerSubject.account);
      expect(text).not.toContain(fakeSecret);
      expect(text).not.toContain("gclient");
    });

    it("needs the sign-in on a server with a password", async () => {
      const { server, google } = setup({ password: true });
      const { accountRef } = await google.setups.start({
        route,
        accountType: "personal",
        connector,
      });
      const response = await get(server, `/api/google/setups/${accountRef}`);
      expect(response.status).toBe(401);
    });

    it.each(["gaccount_missing1", "not a ref", "..%2f..", "gaccount_x_staged"])(
      "answers 404 for %s",
      async (ref) => {
        const { server } = setup();
        const response = await get(server, `/api/google/setups/${ref}`);
        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({ code: "google_setup_not_found" });
      },
    );

    it("answers 404 when no connector uses the account any more", async () => {
      const { server, google } = setup();
      const { accountRef } = await google.setups.start({
        route,
        accountType: "personal",
        connector,
      });
      google.source.describe = async () => null;
      expect((await get(server, `/api/google/setups/${accountRef}`)).status).toBe(404);
    });

    it("answers 404 on every Google path when the host passed no Google ports", async () => {
      const { server } = setup({ withGoogle: false });
      const response = await get(server, "/api/google/setups/gaccount_fake1");
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "not_found" });
    });
  });
});

describe("google client secret", () => {
  verifies("server.google-secret", () => {
    it("keeps the first secret in the store and only its ref on the record", async () => {
      const { server, google } = setup();
      const { accountRef } = await google.setups.start({
        route,
        accountType: "personal",
        connector,
      });

      const response = await putSecret(server, accountRef, secretBody(`  ${fakeSecret}  `));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ saved: true });
      expect([...google.tokens.values.values()]).toEqual([fakeSecret]);
      const record = await google.setups.read(accountRef);
      expect(JSON.stringify(record)).not.toContain(fakeSecret);
      expect(record?.clientSecret?.clientRef).toEqual(expect.any(String));
    });

    it("replaces the secret of a setup that never signed in, in place", async () => {
      const { server, google } = setup();
      const { accountRef } = await google.setups.start({
        route,
        accountType: "personal",
        connector,
      });
      await putSecret(server, accountRef, secretBody(fakeSecret));

      const response = await putSecret(server, accountRef, secretBody(otherFakeSecret));

      expect(response.status).toBe(200);
      expect([...google.tokens.values.values()]).toEqual([otherFakeSecret]);
    });

    it("refuses a replacement once the account has signed in, and keeps the secret in use", async () => {
      const { server, google } = setup();
      const { accountRef } = await google.setups.start({
        route,
        accountType: "personal",
        connector,
      });
      await putSecret(server, accountRef, secretBody(fakeSecret));
      await google.setups.update(accountRef, { kind: "signed-in" });

      const response = await putSecret(server, accountRef, secretBody(otherFakeSecret));

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: "secret_needs_staging" });
      expect([...google.tokens.values.values()]).toEqual([fakeSecret]);
    });

    it("refuses a replacement while another account uses the same client", async () => {
      const { server, google } = setup();
      const first = await google.setups.start({ route, accountType: "personal", connector });
      await putSecret(server, first.accountRef, secretBody(fakeSecret));
      const second = await google.setups.start({ route, accountType: "personal", connector });
      const clientRef = (await google.setups.read(first.accountRef))?.clientSecret?.clientRef ?? "";
      await google.setups.update(second.accountRef, { kind: "client-secret-saved", clientRef });

      const response = await putSecret(server, first.accountRef, secretBody(otherFakeSecret));

      expect(response.status).toBe(409);
      expect([...google.tokens.values.values()]).toEqual([fakeSecret]);
    });

    it("answers 404 for a setup that doesn't exist, and saves nothing", async () => {
      const { server, google } = setup();
      const response = await putSecret(server, "gaccount_missing1", secretBody(fakeSecret));
      expect(response.status).toBe(404);
      expect(google.tokens.values.size).toBe(0);
    });

    it("needs the sign-in", async () => {
      const { server, google } = setup({ password: true });
      const { accountRef } = await google.setups.start({
        route,
        accountType: "personal",
        connector,
      });
      const response = await putSecret(server, accountRef, secretBody(fakeSecret));
      expect(response.status).toBe(401);
      expect(google.tokens.values.size).toBe(0);
    });

    it("refuses a request from another site, a body that isn't JSON, and plain http off this computer", async () => {
      const { server, google } = setup();
      const { accountRef } = await google.setups.start({
        route,
        accountType: "personal",
        connector,
      });

      const crossSite = await putSecret(server, accountRef, secretBody(fakeSecret), {
        "sec-fetch-site": "cross-site",
      });
      const notJson = await putSecret(server, accountRef, secretBody(fakeSecret), {
        "content-type": "text/plain",
      });

      expect(crossSite.status).toBe(403);
      expect(await crossSite.json()).toMatchObject({ code: "secret_from_other_site" });
      expect(notJson.status).toBe(415);
      expect(google.tokens.values.size).toBe(0);
    });

    it("checks the headers before the body: a non-JSON body sent as text/plain gets 415, a cross-site one 403", async () => {
      const { server, google } = setup();
      const { accountRef } = await google.setups.start({
        route,
        accountType: "personal",
        connector,
      });

      const notJson = await putSecret(server, accountRef, fakeSecret, {
        "content-type": "text/plain",
      });
      const crossSiteBadBody = await putSecret(server, accountRef, fakeSecret, {
        "sec-fetch-site": "cross-site",
      });

      expect(notJson.status).toBe(415);
      expect(crossSiteBadBody.status).toBe(403);
      expect(google.tokens.values.size).toBe(0);
    });

    it("sends nothing over plain http to a non-loopback name unless the person confirmed", async () => {
      const { server, google } = setup({ password: true });
      const { accountRef } = await google.setups.start({
        route,
        accountType: "personal",
        connector,
      });
      const session = await signInOverLan(server);
      const send = (clientSecret: string, extra: object = {}) =>
        putSecret(
          server,
          accountRef,
          JSON.stringify({ clientSecret, ...extra }),
          session,
          `http://${lanHost}`,
        );

      const unconfirmed = await send(fakeSecret);
      expect(unconfirmed.status).toBe(403);
      expect(await unconfirmed.json()).toMatchObject({ code: "secure_connection_required" });
      expect(google.tokens.values.size).toBe(0);

      expect((await send(fakeSecret, { confirmedPlainHttp: true })).status).toBe(200);
      expect([...google.tokens.values.values()]).toEqual([fakeSecret]);
    });

    it("takes a secret over https without a confirmation, when the host says so", async () => {
      const { server, google } = setup({ password: true });
      const { accountRef } = await google.setups.start({
        route,
        accountType: "personal",
        connector,
      });
      const session = await signInOverLan(server, { secure: true });
      const response = await server.handle(
        new Request(`http://${lanHost}/api/google/setups/${accountRef}/secret`, {
          method: "PUT",
          headers: { host: lanHost, "content-type": "application/json", ...session },
          body: secretBody(fakeSecret),
        }),
        { secure: true },
      );
      expect(response.status).toBe(200);
    });

    it.each([
      ["not JSON", fakeSecret],
      ["a JSON array", JSON.stringify([fakeSecret])],
      ["a missing secret", JSON.stringify({ other: fakeSecret })],
      ["a number", JSON.stringify({ clientSecret: 12345 })],
      ["only spaces", JSON.stringify({ clientSecret: "   " })],
      ["too long", secretBody(fakeSecret.repeat(30))],
    ])("refuses %s with a fixed answer that holds none of it", async (_name, body) => {
      const { server, google, requestLog, errors } = setup();
      const { accountRef } = await google.setups.start({
        route,
        accountType: "personal",
        connector,
      });

      const response = await putSecret(server, accountRef, body);
      const text = await response.text();

      expect(response.status).toBe(400);
      expect(JSON.parse(text)).toEqual({
        code: "secret_not_accepted",
        message: expect.any(String),
      });
      expect(everythingSaid([text], requestLog, errors)).not.toContain(fakeSecret);
      expect(google.tokens.values.size).toBe(0);
    });

    it("lets a failure inside the route reach the error log without the secret", async () => {
      const { server, google, requestLog, errors } = setup();
      const { accountRef } = await google.setups.start({
        route,
        accountType: "personal",
        connector,
      });
      google.clientSecrets.saveClientSecret = async (value) => {
        throw new Error(`the store failed while it held ${value}`.replace(value, "a value"));
      };

      const response = await putSecret(server, accountRef, secretBody(fakeSecret));
      const text = await response.text();

      expect(response.status).toBe(500);
      expect(errors).toHaveLength(1);
      expect(everythingSaid([text], requestLog, errors)).not.toContain(fakeSecret);
    });

    it("leaves a good and a bad secret out of every answer and log line", async () => {
      const { server, google, requestLog, errors } = setup();
      const { accountRef } = await google.setups.start({
        route,
        accountType: "personal",
        connector,
      });
      const answers: string[] = [];
      for (const body of [`{"clientSecret": "${otherFakeSecret}`, secretBody(fakeSecret)]) {
        answers.push(await (await putSecret(server, accountRef, body)).text());
      }
      answers.push(await (await get(server, `/api/google/setups/${accountRef}`)).text());

      const said = everythingSaid(answers, requestLog, errors);
      expect(said).not.toContain(fakeSecret);
      expect(said).not.toContain(otherFakeSecret);
    });
  });
});

describe("request log", () => {
  verifies("server.request-log", () => {
    it("records method, path and status, and never the query", async () => {
      const { server, requestLog } = setup();
      await get(server, "/api/hello?code=fake-code&state=fake-state");
      expect(requestLog).toEqual([{ method: "GET", path: "/api/hello", status: 200 }]);
      expect(JSON.stringify(requestLog)).not.toContain("fake-code");
    });

    it("records nothing for a route that takes a secret, whatever its status", async () => {
      const { server, google, requestLog } = setup();
      const { accountRef } = await google.setups.start({
        route,
        accountType: "personal",
        connector,
      });
      await putSecret(server, accountRef, secretBody(fakeSecret));
      await putSecret(server, accountRef, "not json");
      await putSecret(server, "gaccount_missing1", secretBody(fakeSecret));
      expect(requestLog).toEqual([]);
    });

    it("records a failed request with the status the caller got", async () => {
      const { server, google, requestLog } = setup();
      google.source.describe = async () => {
        throw new Error("boom");
      };
      const { accountRef } = await google.setups.start({
        route,
        accountType: "personal",
        connector,
      });
      await get(server, `/api/google/setups/${accountRef}`);
      expect(requestLog).toEqual([
        { method: "GET", path: `/api/google/setups/${accountRef}`, status: 500 },
      ]);
    });
  });
});
