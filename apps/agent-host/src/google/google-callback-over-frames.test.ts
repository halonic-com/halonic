import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ProfileFolder, workspaceFolders } from "@halonicjs/profile";
import type { GoogleAccountActions } from "@halonicjs/host-server";
import { encodeBase64url } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FramedHostServer, serveHostOverFrames } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { FrameKind } from "../stdio/frame-codec.ts";
import { TestRelay } from "../stdio/relay.test-helper.ts";
import { googleRoutes } from "./google-routes.ts";
import { openGoogleSetup } from "./google-setup.ts";

// Invented values only: none is a real key or token.
const tokenKey = encodeBase64url(new Uint8Array(32).fill(7));
const fakeClientId = "1234-abc123.apps.googleusercontent.com";
const fakeClientSecret = "fake-client-secret-0000000001";
const relayPort = 50_123;
const relayHost = `127.0.0.1:${relayPort}`;
const token = randomLaunchToken();
const callbackPath = "/v1/google/callback";

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
let server: FramedHostServer | undefined;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-google-callback-frames-"));
  const acme = join(folder, "acme");
  await mkdir(join(acme, "library", "connectors"), { recursive: true });
  await mkdir(join(acme, "integrations", "gmail"), { recursive: true });
  await writeFile(join(acme, "workspace.yaml"), "id: acme\nname: Acme\n");
  await writeFile(
    join(acme, "library", "connectors", "mailbox.connector.yaml"),
    "name: Mailbox\ntransport:\n  google:\n    account: family@example.com\n",
  );
  await writeFile(join(acme, "integrations", "gmail", "integration.yaml"), gmailSheet);
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await rm(folder, { recursive: true, force: true });
});

const profile = (): ProfileFolder => ({
  platform: process.platform === "win32" ? "windows" : "linux",
  root: join(folder, "profile"),
});

/**
 * The Google routes of a temporary profile, served over frames as in `--stdio` mode.
 * `finishSignIn` stands in for the sign-in's end, which would call Google.
 */
function served(finishSignIn?: GoogleAccountActions["finishSignIn"]) {
  const google = openGoogleSetup({
    profile: profile(),
    env: { HALONIC_SECRET_TOKEN_KEY: tokenKey },
    workspaceRoots: [join(folder, "acme")],
  });
  if (finishSignIn !== undefined) google.actions.finishSignIn = finishSignIn;
  const relay = new TestRelay();
  const routes = googleRoutes({ google, relayPort });
  server = serveHostOverFrames(token, routes, relay.streams, relayPort);
  return { google, relay };
}

/** A setup record for the `mailbox` connector with a client ID and a saved fake secret. */
async function readyAccount(google: ReturnType<typeof openGoogleSetup>): Promise<string> {
  const folders = await workspaceFolders(profile(), await realpath(join(folder, "acme")), {
    sha256: async (data) =>
      new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data))),
  });
  const { accountRef } = await google.setups.start({
    route: { app: "own", runsOn: "this-computer" },
    accountType: "personal",
    connector: { workspace: folders.key, id: "mailbox" },
  });
  await google.setups.update(accountRef, { kind: "client-id", clientId: fakeClientId });
  const clientRef = await google.clientSecrets.saveClientSecret(fakeClientSecret);
  await google.setups.update(accountRef, { kind: "client-secret-saved", clientRef });
  return accountRef;
}

const withToken = {
  host: relayHost,
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
};

verifies("agent-host.google-callback-over-frames", () => {
  describe("the Google sign-in over frames", () => {
    it("sends Google's redirect to the relay's port, and the callback finishes that sign-in", async () => {
      const finished: (string | null)[] = [];
      const { google, relay } = served(async (query) => {
        finished.push(query.get("state"));
        return { kind: "linkNoLongerValid" };
      });
      const accountRef = await readyAccount(google);

      const started = await relay.request("/v1/google/sign-in", {
        method: "POST",
        headers: withToken,
        body: JSON.stringify({ accountRef }),
      });
      const authUrl = new URL((JSON.parse(started.body) as { authUrl: string }).authUrl);
      const redirect = new URL(authUrl.searchParams.get("redirect_uri") ?? "");
      expect(redirect.origin + redirect.pathname).toBe(`http://${relayHost}${callbackPath}`);
      expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
      const state = authUrl.searchParams.get("state") ?? "";

      // Google's redirect: no launch token, the relay's address, the state of the sign-in.
      const answer = await relay.request(`${redirect.pathname}?state=${state}&code=fake-code`, {
        headers: { host: relayHost },
      });

      expect(answer.status).toBe(200);
      expect(answer.headers["content-type"]).toContain("text/html");
      expect(finished).toEqual([state]);
    });

    it("answers the page with no-store, no referrer and a closed connection", async () => {
      const { relay } = served();

      const answer = await relay.request(`${callbackPath}?state=nobody&code=fake-code`, {
        headers: { host: relayHost },
      });

      expect(answer.status).toBe(200);
      expect(answer.headers["cache-control"]).toBe("no-store");
      expect(answer.headers["referrer-policy"]).toBe("no-referrer");
      expect(answer.headers["connection"]).toBe("close");
    });

    it("closes the connection at once, without waiting for the keep-alive timeout", async () => {
      const { relay } = served();

      await relay.request(`${callbackPath}?state=nobody&code=fake-code`, {
        headers: { host: relayHost },
      });
      // Fails by the test's own time limit, well under Node's 5 s `keepAliveTimeout`.
      const end = await relay.frameWhere((frame) => frame.kind === FrameKind.end);
      expect(end.kind).toBe(FrameKind.end);
    }, 2_000);

    it("says the link is no longer valid for a state no sign-in started, and keeps no query out of the page", async () => {
      const { relay } = served();

      const answer = await relay.request(
        `${callbackPath}?state=nobody-started-this&code=fake-code`,
        {
          headers: { host: relayHost },
        },
      );

      expect(answer.body).toContain("no longer valid");
      expect(answer.body).not.toContain("nobody-started-this");
    });

    it.each([
      ["another port", { host: "127.0.0.1:50124" }, 421],
      ["a rebound host name", { host: `attacker.example:${relayPort}` }, 421],
      ["a web page's origin", { host: relayHost, origin: "https://attacker.example" }, 403],
    ])("still refuses a callback with %s", async (_name, headers, status) => {
      const { relay } = served();

      const answer = await relay.request(`${callbackPath}?state=nobody&code=fake-code`, {
        headers,
      });

      expect(answer.status).toBe(status);
    });

    it("serves the callback only at the relay's path, and needs the token everywhere else", async () => {
      const { relay } = served();

      const direct = await relay.request("/api/google/callback?state=nobody", {
        headers: { host: relayHost },
      });
      const other = await relay.request("/v1/google/sign-in", {
        method: "POST",
        headers: { host: relayHost },
      });

      expect(direct.status).toBe(401);
      expect(other.status).toBe(401);
    });
  });
});
