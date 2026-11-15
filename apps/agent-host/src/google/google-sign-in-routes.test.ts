import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ProfileFolder, workspaceFolders } from "@halonicjs/profile";
import { encodeBase64url } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { googleRoutes } from "./google-routes.ts";
import { openGoogleSetup } from "./google-setup.ts";

// Invented values only: none is a real key, token or client secret.
const tokenKey = encodeBase64url(new Uint8Array(32).fill(7));
const fakeClientId = "1234-abc123.apps.googleusercontent.com";
const fakeClientSecret = "fake-client-secret-0000000001";
const address = "family@example.com";
const route = { app: "own", runsOn: "this-computer" } as const;
const token = randomLaunchToken();

const gmailSheet = `id: gmail
version: 0.1.0
kit: 1
provides: [connector]
hosts:
  - gmail.googleapis.com
secrets:
  google-account:
    purpose: Access to the Google account you connect.
    hosts: [gmail.googleapis.com]
    as: bearer
googleScopes:
  - scope: https://www.googleapis.com/auth/gmail.modify
    reason: Reads and sends your mail.
googleApis:
  - api: gmail.googleapis.com
    name: Gmail API
googleCheck:
  method: GET
  url: https://gmail.googleapis.com/gmail/v1/users/me/profile
tools: []
`;

let folder: string;
let acme: string;
let server: HostServer | undefined;
let logged: string[];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-google-sign-in-routes-"));
  acme = join(folder, "acme");
  logged = [];
  await mkdir(join(acme, "library", "connectors"), { recursive: true });
  await mkdir(join(acme, "integrations", "gmail"), { recursive: true });
  await writeFile(join(acme, "workspace.yaml"), "id: acme\nname: Acme\n");
  await writeFile(
    join(acme, "library", "connectors", "mailbox.connector.yaml"),
    `name: Mailbox\ntransport:\n  google:\n    account: ${address}\n`,
  );
  await writeFile(join(acme, "integrations", "gmail", "integration.yaml"), gmailSheet);
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await rm(folder, { recursive: true, force: true });
});

/** The profile of a temporary folder, with the system the test runs on: `acme`'s path must be absolute there. */
const profile = (): ProfileFolder => ({
  platform: process.platform === "win32" ? "windows" : "linux",
  root: join(folder, "profile"),
});

/** The routes over the real stores of a temporary profile that serves `acme`. */
async function started() {
  const google = openGoogleSetup({
    profile: profile(),
    env: { HALONIC_SECRET_TOKEN_KEY: tokenKey },
    workspaceRoots: [acme],
  });
  server = await startHostServer(token, googleRoutes({ google, log: (text) => logged.push(text) }));
  return { url: server.url, google };
}

/** A setup record linked to `connector` of `acme`, with its client ID and a saved fake secret. */
async function readyAccount(google: ReturnType<typeof openGoogleSetup>, connector: string) {
  const folders = await workspaceFolders(profile(), await realpath(acme), {
    sha256: async (data) =>
      new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data))),
  });
  const { accountRef } = await google.setups.start({
    route,
    accountType: "personal",
    connector: { workspace: folders.key, id: connector },
  });
  await google.setups.update(accountRef, { kind: "client-id", clientId: fakeClientId });
  const clientRef = await google.clientSecrets.saveClientSecret(fakeClientSecret);
  await google.setups.update(accountRef, { kind: "client-secret-saved", clientRef });
  return accountRef;
}

function post(url: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

verifies("agent-host.google-sign-in-routes", () => {
  describe("the Google sign-in routes", () => {
    it("starts the sign-in for the connector's account, with a redirect to the host's own port", async () => {
      const { url, google } = await started();
      const accountRef = await readyAccount(google, "mailbox");

      const response = await post(url, "/v1/google/sign-in", { accountRef });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { authUrl: string };
      const authUrl = new URL(body.authUrl);
      expect(authUrl.searchParams.get("login_hint")).toBe(address);
      expect(authUrl.searchParams.get("client_id")).toBe(fakeClientId);
      expect(authUrl.searchParams.get("redirect_uri")).toBe(
        `http://127.0.0.1:${new URL(url).port}/api/google/callback`,
      );
      expect(authUrl.searchParams.get("scope")).toContain("gmail.modify");
      expect(Object.keys(body)).toEqual(["authUrl"]);
      expect((await google.setups.read(accountRef))?.signInStartedAt).not.toBeNull();
    });

    it("answers 404 when no served workspace holds the connector", async () => {
      const { url, google } = await started();
      const accountRef = await readyAccount(google, "gone");

      const response = await post(url, "/v1/google/sign-in", { accountRef });

      expect(response.status).toBe(404);
    });

    it("cancels a started sign-in, so a callback with its state finishes nothing", async () => {
      const { url, google } = await started();
      const accountRef = await readyAccount(google, "mailbox");
      const pending = (await (await post(url, "/v1/google/sign-in", { accountRef })).json()) as {
        authUrl: string;
      };
      const state = new URL(pending.authUrl).searchParams.get("state") ?? "";

      const response = await post(url, "/v1/google/sign-in/cancel", { accountRef });
      const finished = await google.actions.finishSignIn(
        new URLSearchParams({ state, code: "fake-code" }),
      );

      expect(response.status).toBe(204);
      expect(finished).toEqual({ kind: "linkNoLongerValid" });
      expect((await google.setups.read(accountRef))?.signInStartedAt).toBeNull();
    });

    it("answers 204 when nothing is pending", async () => {
      const { url, google } = await started();
      const accountRef = await readyAccount(google, "mailbox");

      const response = await post(url, "/v1/google/sign-in/cancel", { accountRef });

      expect(response.status).toBe(204);
    });

    it("refuses a ref that isn't a ref before it reads anything", async () => {
      const { url } = await started();

      const response = await post(url, "/v1/google/sign-in", { accountRef: "../Etc" });

      expect(response.status).toBe(400);
    });
  });
});
