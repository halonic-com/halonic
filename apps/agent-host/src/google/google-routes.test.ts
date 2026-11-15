import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshTokenName } from "@halonicjs/google-setup";
import type { GoogleSetupPorts } from "@halonicjs/host-server";
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
const fakeRefreshToken = "fake-refresh-token-0000000001";
const fakeClientSecret = "fake-client-secret-0000000001";
const fakeClientId = "1234-abc123.apps.googleusercontent.com";
const route = { app: "own", runsOn: "this-computer" } as const;
const connector = { workspace: "0123456789abcdef0123456789abcdef", id: "gmail" };

const token = randomLaunchToken();
let profileRoot: string;
let server: HostServer | undefined;
let logged: string[];
let revokeRequests: { url: string; body: string }[];
let googleAnswers: "confirms" | "is unreachable";

/** Google's revoke endpoint, scripted by the test. */
const fakeGoogle: HttpClient = {
  fetch: async (url, init) => {
    revokeRequests.push({ url: String(url), body: String(init?.body) });
    if (googleAnswers === "is unreachable") throw new Error("network down");
    return new Response("{}", { status: 200 });
  },
};

beforeEach(async () => {
  profileRoot = await mkdtemp(join(tmpdir(), "halonic-google-routes-"));
  logged = [];
  revokeRequests = [];
  googleAnswers = "confirms";
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

async function signedInAccount(google: GoogleSetupPorts, clientRef?: string) {
  const { accountRef } = await google.setups.start({ route, accountType: "personal", connector });
  await google.setups.update(accountRef, { kind: "client-id", clientId: fakeClientId });
  const ref = clientRef ?? (await google.clientSecrets.saveClientSecret(fakeClientSecret));
  await google.setups.update(accountRef, { kind: "client-secret-saved", clientRef: ref });
  await google.setups.update(accountRef, { kind: "signed-in" });
  await google.tokens.set(refreshTokenName(accountRef), fakeRefreshToken);
  return { accountRef, clientRef: ref };
}

function disconnect(url: string, body: unknown): Promise<Response> {
  return fetch(`${url}/v1/google/disconnect`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

verifies("agent-host.google-routes", () => {
  describe("the Google disconnect route", () => {
    it("revokes the token with Google, then removes the token, the record and the secret", async () => {
      const { url, google } = await started();
      const { accountRef, clientRef } = await signedInAccount(google);

      const response = await disconnect(url, { accountRef });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        disconnected: true,
        googleConfirmed: true,
        clientSecret: "removed",
      });
      expect(revokeRequests).toHaveLength(1);
      expect(revokeRequests[0]?.body).toBe(`token=${fakeRefreshToken}`);
      expect(await google.tokens.get(refreshTokenName(accountRef))).toBeNull();
      expect(await google.clientSecrets.readClientSecret(clientRef)).toBeNull();
      expect(await google.setups.read(accountRef).catch(() => null)).toBeNull();
    });

    it("removes everything and says so when Google doesn't answer", async () => {
      const { url, google } = await started();
      const { accountRef } = await signedInAccount(google);
      googleAnswers = "is unreachable";

      const response = await disconnect(url, { accountRef });

      expect(await response.json()).toMatchObject({ disconnected: true, googleConfirmed: false });
      expect(await google.tokens.get(refreshTokenName(accountRef))).toBeNull();
    });

    it("keeps the client secret while another account uses the client", async () => {
      const { url, google } = await started();
      const first = await signedInAccount(google);
      const second = await signedInAccount(google, first.clientRef);

      const response = await disconnect(url, { accountRef: first.accountRef });

      expect(await response.json()).toMatchObject({ clientSecret: "kept-for-other-accounts" });
      expect(await google.clientSecrets.readClientSecret(first.clientRef)).toBe(fakeClientSecret);
      expect(await google.tokens.get(refreshTokenName(second.accountRef))).toBe(fakeRefreshToken);
    });

    it("answers 404 for an account with no setup", async () => {
      const { url } = await started();

      const response = await disconnect(url, { accountRef: "gaccount_missing1" });

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: { kind: "google_setup_not_found" } });
      expect(revokeRequests).toEqual([]);
    });

    it.each(["../x", "a/b", "Gaccount_1", "", "gaccount_1/../../x", 7])(
      "refuses the ref %j with 400 before it reads anything",
      async (accountRef) => {
        const { url } = await started();

        const response = await disconnect(url, { accountRef });

        expect(response.status).toBe(400);
        expect(revokeRequests).toEqual([]);
      },
    );

    it("refuses a body with anything besides the ref", async () => {
      const { url, google } = await started();
      const { accountRef } = await signedInAccount(google);

      const response = await disconnect(url, { accountRef, token: "x" });

      expect(response.status).toBe(400);
      expect(await google.tokens.get(refreshTokenName(accountRef))).toBe(fakeRefreshToken);
    });

    it("answers 502 with a fixed message, and logs the cause, when the token key isn't set", async () => {
      const { url } = await started({});
      const { accountRef } = await signedInAccount(openWithKey());

      const response = await disconnect(url, { accountRef });

      expect(response.status).toBe(502);
      const text = await response.text();
      expect(text).toContain("google_failed");
      expect(text).not.toContain("token key");
      expect(logged.join("")).toContain("token key");
    });

    it("never answers or logs a token or a client secret", async () => {
      const { url, google } = await started();
      const { accountRef } = await signedInAccount(google);

      const text = await (await disconnect(url, { accountRef })).text();

      for (const secret of [fakeRefreshToken, fakeClientSecret, tokenKey]) {
        expect(text).not.toContain(secret);
        expect(logged.join("")).not.toContain(secret);
      }
    });

    it("asks for the host's token like every other route", async () => {
      const { url } = await started();

      const response = await fetch(`${url}/v1/google/disconnect`, {
        method: "POST",
        body: JSON.stringify({ accountRef: "gaccount_1" }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe("the Google setup of a profile", () => {
    it("keeps its tokens sealed on disk", async () => {
      const { google } = await started();
      const { accountRef } = await signedInAccount(google);

      const files = await readTokenFiles();

      expect(accountRef).toMatch(/^gaccount_/u);
      expect(files).not.toContain(fakeRefreshToken);
      expect(files).not.toContain(fakeClientSecret);
    });
  });
});

/** The same profile opened with the key set, to seed what the host then can't open. */
function openWithKey(): GoogleSetupPorts {
  return openGoogleSetup({
    profile: { platform: "linux", root: profileRoot },
    env: { HALONIC_SECRET_TOKEN_KEY: tokenKey },
    http: fakeGoogle,
  });
}

async function readTokenFiles(): Promise<string> {
  const folder = join(profileRoot, "google", "tokens");
  const names = await readdir(folder);
  const contents = await Promise.all(names.map((name) => readFile(join(folder, name), "utf8")));
  return contents.join("\n");
}
