import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshTokenName } from "@halonicjs/google-setup";
import type { HttpClient } from "@halonicjs/ports";
import { encodeBase64url } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { googleRoutes } from "./google-routes.ts";
import { openGoogleSetup } from "./google-setup.ts";

// Invented values only: none is a real key, token or client secret.
const tokenKey = encodeBase64url(new Uint8Array(32).fill(7));
const oldSecret = "fake-old-secret-0000000001";
const newSecret = "fake-new-secret-0000000002";
const fakeAccessToken = "fake-access-token";
const fakeRefreshToken = "fake-refresh-token-0000000001";
const fakeClientId = "1234-abc123.apps.googleusercontent.com";
const route = { app: "own", runsOn: "this-computer" } as const;
const connector = { workspace: "0123456789abcdef0123456789abcdef", id: "gmail" };

const token = randomLaunchToken();
let profileRoot: string;
let server: HostServer | undefined;
let logged: string[];
let googleAnswers: "accepts" | "refuses the secret" | "refuses the token" | "is unreachable";

/** Google's token endpoint, scripted by the test. */
const fakeGoogle: HttpClient = {
  fetch: async () => {
    switch (googleAnswers) {
      case "accepts":
        return Response.json({ access_token: fakeAccessToken, expires_in: 3599 });
      case "refuses the secret":
        return Response.json({ error: "invalid_client" }, { status: 401 });
      case "refuses the token":
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      case "is unreachable":
        throw new Error("network down");
    }
  },
};

beforeEach(async () => {
  profileRoot = await mkdtemp(join(tmpdir(), "halonic-google-secret-routes-"));
  logged = [];
  googleAnswers = "accepts";
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await rm(profileRoot, { recursive: true, force: true });
});

/** The routes over the real stores in a temporary profile folder, with `env` as the host's environment. */
async function started(env: Record<string, string> = { HALONIC_SECRET_TOKEN_KEY: tokenKey }) {
  const google = openGoogleSetup({
    profile: { platform: "linux", root: profileRoot },
    env,
    http: fakeGoogle,
  });
  server = await startHostServer(token, googleRoutes({ google, log: (text) => logged.push(text) }));
  return { url: server.url, google };
}

type Google = Awaited<ReturnType<typeof started>>["google"];

/** A setup with a client ID, and the old secret kept: it has never signed in. */
async function setupWithSecret(google: Google) {
  const { accountRef } = await google.setups.start({ route, accountType: "personal", connector });
  await google.setups.update(accountRef, { kind: "client-id", clientId: fakeClientId });
  const clientRef = await google.clientSecrets.saveClientSecret(oldSecret);
  await google.setups.update(accountRef, { kind: "client-secret-saved", clientRef });
  return { accountRef, clientRef };
}

/** A setup that signed in, so a new secret must be checked with Google first. */
async function signedInSetup(google: Google) {
  const setup = await setupWithSecret(google);
  await google.setups.update(setup.accountRef, { kind: "signed-in" });
  await google.tokens.set(refreshTokenName(setup.accountRef), fakeRefreshToken);
  return setup;
}

function post(url: string, path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Every file under the profile folder, as text, so a test can look for a secret that landed in one. */
async function profileText(): Promise<string> {
  const names = await readdir(profileRoot, { recursive: true });
  const texts = await Promise.all(
    names.map((name) => readFile(join(profileRoot, name), "utf8").catch(() => "")),
  );
  return texts.join("\n");
}

verifies("agent-host.google-secret-routes", () => {
  describe("save", () => {
    it("keeps the first secret of a setup and answers that it did", async () => {
      const { url, google } = await started();
      const { accountRef } = await google.setups.start({
        route,
        accountType: "personal",
        connector,
      });

      const response = await post(url, "/v1/google/secret", {
        accountRef,
        clientSecret: newSecret,
      });

      expect(await response.json()).toEqual({ saved: true });
      const clientRef = (await google.setups.read(accountRef))?.clientSecret?.clientRef ?? "";
      expect(await google.clientSecrets.readClientSecret(clientRef)).toBe(newSecret);
    });

    it("answers 409 secret_needs_staging for a signed-in setup and keeps the secret in use", async () => {
      const { url, google } = await started();
      const { accountRef, clientRef } = await signedInSetup(google);

      const response = await post(url, "/v1/google/secret", {
        accountRef,
        clientSecret: newSecret,
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { kind: "secret_needs_staging" } });
      expect(await google.clientSecrets.readClientSecret(clientRef)).toBe(oldSecret);
    });

    it("answers 404 for a ref with no setup", async () => {
      const { url } = await started();

      const response = await post(url, "/v1/google/secret", {
        accountRef: "gaccount_missing1",
        clientSecret: newSecret,
      });

      expect(response.status).toBe(404);
    });
  });

  describe("replace", () => {
    it("replaces the secret of a setup that never signed in, with no check", async () => {
      const { url, google } = await started();
      const { accountRef, clientRef } = await setupWithSecret(google);

      const response = await post(url, "/v1/google/secret/replace", {
        accountRef,
        clientSecret: newSecret,
      });

      expect(await response.json()).toEqual({ result: "replaced" });
      expect(await google.clientSecrets.readClientSecret(clientRef)).toBe(newSecret);
    });

    it("promotes a secret Google accepts and says which accounts it fixed", async () => {
      const { url, google } = await started();
      const { accountRef, clientRef } = await signedInSetup(google);

      const response = await post(url, "/v1/google/secret/replace", {
        accountRef,
        clientSecret: newSecret,
      });

      expect(await response.json()).toEqual({ result: "accepted", accountsFixed: [] });
      expect(await google.clientSecrets.readClientSecret(clientRef)).toBe(newSecret);
      expect(await google.clientSecrets.readStagedClientSecret(clientRef)).toBeNull();
    });

    it("keeps the old secret when Google refuses the new one", async () => {
      const { url, google } = await started();
      const { accountRef, clientRef } = await signedInSetup(google);
      googleAnswers = "refuses the secret";

      const response = await post(url, "/v1/google/secret/replace", {
        accountRef,
        clientSecret: newSecret,
      });

      expect(await response.json()).toEqual({ result: "refused" });
      expect(await google.clientSecrets.readClientSecret(clientRef)).toBe(oldSecret);
      expect(await google.clientSecrets.readStagedClientSecret(clientRef)).toBeNull();
    });

    it("passes on a refused sign-in as its own result and keeps the staged secret", async () => {
      const { url, google } = await started();
      const { accountRef, clientRef } = await signedInSetup(google);
      googleAnswers = "refuses the token";

      const response = await post(url, "/v1/google/secret/replace", {
        accountRef,
        clientSecret: newSecret,
      });

      expect(await response.json()).toEqual({ result: "signInRefused" });
      expect(await google.clientSecrets.readClientSecret(clientRef)).toBe(oldSecret);
      expect(await google.clientSecrets.readStagedClientSecret(clientRef)).toBe(newSecret);
    });

    it("passes on any other outcome as its own word and leaves both secrets", async () => {
      const { url, google } = await started();
      const { accountRef, clientRef } = await signedInSetup(google);
      googleAnswers = "is unreachable";

      const response = await post(url, "/v1/google/secret/replace", {
        accountRef,
        clientSecret: newSecret,
      });

      expect(await response.json()).toEqual({ result: "unreachable" });
      expect(await google.clientSecrets.readClientSecret(clientRef)).toBe(oldSecret);
      expect(await google.clientSecrets.readStagedClientSecret(clientRef)).toBe(newSecret);
    });

    it("stages the secret again on a retry", async () => {
      const { url, google } = await started();
      const { accountRef, clientRef } = await signedInSetup(google);
      googleAnswers = "is unreachable";
      await post(url, "/v1/google/secret/replace", { accountRef, clientSecret: newSecret });
      googleAnswers = "accepts";

      const response = await post(url, "/v1/google/secret/replace", {
        accountRef,
        clientSecret: newSecret,
      });

      expect(await response.json()).toMatchObject({ result: "accepted" });
      expect(await google.clientSecrets.readClientSecret(clientRef)).toBe(newSecret);
    });

    it("answers 404 for a ref with no setup", async () => {
      const { url } = await started();

      const response = await post(url, "/v1/google/secret/replace", {
        accountRef: "gaccount_missing1",
        clientSecret: newSecret,
      });

      expect(response.status).toBe(404);
    });
  });

  describe("what a request may carry", () => {
    it.each(["/v1/google/secret", "/v1/google/secret/replace"])(
      "refuses %s without the launch token",
      async (path) => {
        const { url, google } = await started();
        const { accountRef } = await setupWithSecret(google);

        const response = await fetch(`${url}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accountRef, clientSecret: newSecret }),
        });

        expect(response.status).toBe(401);
      },
    );

    it("builds its own request: the page's content type and site headers don't reach the handler", async () => {
      const { url, google } = await started();
      const { accountRef } = await setupWithSecret(google);

      const response = await post(
        url,
        "/v1/google/secret/replace",
        { accountRef, clientSecret: newSecret },
        { "content-type": "text/plain" },
      );

      // The handler would refuse text/plain with 415; it got the host's own application/json.
      expect(await response.json()).toEqual({ result: "replaced" });
    });

    it.each([
      ["a ref that isn't a ref", { accountRef: "../x", clientSecret: newSecret }],
      ["an empty secret", { accountRef: "gaccount_one1", clientSecret: "" }],
      ["a secret that is too long", { accountRef: "gaccount_one1", clientSecret: "x".repeat(513) }],
      ["a key it doesn't know", { accountRef: "gaccount_one1", clientSecret: newSecret, extra: 1 }],
      ["a secret that isn't text", { accountRef: "gaccount_one1", clientSecret: 7 }],
    ])("refuses %s with 400", async (_name, body) => {
      const { url } = await started();

      const response = await post(url, "/v1/google/secret", body);

      expect(response.status).toBe(400);
    });
  });

  describe("what the host keeps out of its answers and its log", () => {
    it.each([
      ["a body that isn't JSON", `{"accountRef":"gaccount_one1","clientSecret":"${newSecret}`],
      [
        "a key it doesn't know, named by the secret",
        `{"accountRef":"gaccount_one1","clientSecret":"${newSecret}","${newSecret}":1}`,
      ],
      [
        "a ref that isn't a ref, beside the secret",
        `{"accountRef":"${newSecret}","clientSecret":"${newSecret}"}`,
      ],
    ])("holds no part of the secret for %s", async (_name, body) => {
      const { url } = await started();

      const responses = await Promise.all(
        ["/v1/google/secret", "/v1/google/secret/replace"].map((path) => post(url, path, body)),
      );

      for (const response of responses) {
        expect(response.status).toBe(400);
        expect(await response.text()).not.toContain(newSecret);
      }
      expect(logged.join("")).not.toContain(newSecret);
    });

    it("answers 502 with fixed text and logs only the error's name when it can't finish", async () => {
      // No key to seal the secret with, so keeping it fails inside the handler.
      const { url, google } = await started({});
      const { accountRef } = await google.setups.start({
        route,
        accountType: "personal",
        connector,
      });

      const responses = await Promise.all(
        ["/v1/google/secret", "/v1/google/secret/replace"].map((path) =>
          post(url, path, { accountRef, clientSecret: newSecret }),
        ),
      );

      for (const response of responses) {
        expect(response.status).toBe(502);
        const text = await response.text();
        expect(text).toContain("google_failed");
        expect(text).not.toContain(newSecret);
      }
      expect(logged).toHaveLength(2);
      expect(logged.join("")).toMatch(/A Google secret request failed \(\w+\)\./u);
      expect(logged.join("")).not.toContain(newSecret);
    });

    it("writes the secret nowhere in the profile except sealed", async () => {
      const { url, google } = await started();
      const { accountRef } = await signedInSetup(google);

      await post(url, "/v1/google/secret/replace", { accountRef, clientSecret: newSecret });

      expect(await profileText()).not.toContain(newSecret);
      expect(logged.join("")).not.toContain(newSecret);
    });
  });
});
