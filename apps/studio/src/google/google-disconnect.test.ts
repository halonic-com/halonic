import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentHostGoogleSetup,
  type AgentHostRequestRoute,
  type AgentHostTransport,
} from "@halonicjs/adapter-agent-host-client";
import { FileRecordStore } from "@halonicjs/adapter-fs-node";
import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import { MemoryDefinitionStore, MemoryFolderReader } from "@halonicjs/adapter-memory";
import {
  googleRoutes,
  type HostServer,
  openGoogleSetup,
  randomLaunchToken,
  startHostServer,
} from "@halonicjs/app-agent-host/google-host";
import { refreshTokenName, setupRecords } from "@halonicjs/google-setup";
import type { HttpClient } from "@halonicjs/ports";
import { encodeBase64url, systemClock } from "@halonicjs/std";
import { RefusalsFeed } from "@halonicjs/studio-feature-library/api";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceConnectorStatus } from "../library/workspace-connector-status.ts";
import { WorkspaceGoogleSetupAccounts } from "./workspace-google-setup-accounts.ts";

// Invented values only: none is a real key, token or client secret.
const tokenKey = encodeBase64url(new Uint8Array(32).fill(7));
const fakeRefreshToken = "fake-refresh-token-0000000001";
const fakeClientSecret = "fake-client-secret-0000000001";
const workspaceKey = "a".repeat(32);

let profileRoot: string;
let server: HostServer | undefined;

let googleAnswers: "confirms" | "is unreachable";

/** Google's revoke endpoint, scripted by the test. */
const fakeGoogle: HttpClient = {
  fetch: async () => {
    if (googleAnswers === "is unreachable") throw new Error("network down");
    return new Response("{}", { status: 200 });
  },
};

beforeEach(async () => {
  googleAnswers = "confirms";
  profileRoot = await mkdtemp(join(tmpdir(), "halonic-google-disconnect-"));
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await rm(profileRoot, { recursive: true, force: true });
});

/** The page's transport over HTTP, in place of the shell's: the host's own launch token and URL. */
function httpTransport(url: string, token: string): AgentHostTransport {
  return {
    request: async (route: AgentHostRequestRoute, body?: unknown) => {
      const [method, path] = route.split(" ") as [string, string];
      const response = await fetch(`${url}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
      });
      return { status: response.status, body: await response.json() };
    },
    stream: async () => {
      throw new Error("The Google routes have no stream.");
    },
  };
}

/** The agent host over a temporary profile, with a signed-in Google account for the workspace's `mail` connector. */
async function hostWithSignedInAccount() {
  const google = openGoogleSetup({
    profile: { platform: "linux", root: profileRoot },
    env: { HALONIC_SECRET_TOKEN_KEY: tokenKey },
    http: fakeGoogle,
  });
  const { accountRef } = await google.setups.start({
    route: { app: "own", runsOn: "this-computer" },
    accountType: "personal",
    connector: { workspace: workspaceKey, id: "mail" },
  });
  await google.setups.update(accountRef, {
    kind: "client-id",
    clientId: "1234-abc123.apps.googleusercontent.com",
  });
  const clientRef = await google.clientSecrets.saveClientSecret(fakeClientSecret);
  await google.setups.update(accountRef, { kind: "client-secret-saved", clientRef });
  await google.setups.update(accountRef, { kind: "signed-in" });
  await google.tokens.set(refreshTokenName(accountRef), fakeRefreshToken);
  const token = randomLaunchToken();
  server = await startHostServer(token, googleRoutes({ google }));
  return { google, accountRef, clientRef, transport: httpTransport(server.url, token) };
}

/** The app's side: the same profile folder read as records, the way the shell reads it. */
function appOver(transport: AgentHostTransport) {
  const definitions = new MemoryDefinitionStore({
    "workspace.yaml": "id: acme\nname: Acme\n",
    "library/connectors/mail.connector.yaml":
      "version: 1\nid: mail\ntransport: { google: { account: sam@acme.example } }\n",
  });
  const accounts = new WorkspaceGoogleSetupAccounts({
    definitions,
    folder: new MemoryFolderReader(),
    digest: webCryptoDigest,
    setups: setupRecords({
      records: new FileRecordStore(join(profileRoot, "google", "setups")),
      clock: systemClock,
      ids: {
        next: () => {
          throw new Error("The app doesn't make account refs.");
        },
      },
    }),
    workspaceKey: async () => workspaceKey,
    host: new AgentHostGoogleSetup(transport),
  });
  const status = new WorkspaceConnectorStatus({
    definitions,
    refusals: new RefusalsFeed(),
    google: accounts,
  });
  return { accounts, status };
}

const mailState = async (status: WorkspaceConnectorStatus) =>
  (await status.list()).find(({ id }) => id === "mail")?.state;

verifies("studio.workspace-google-setup-accounts", () => {
  describe("Disconnect Google, from the app through the real agent host", () => {
    it("lists the connector as connected, then as not connected with its sign-in removed", async () => {
      const { google, accountRef, clientRef, transport } = await hostWithSignedInAccount();
      const { accounts, status } = appOver(transport);
      const told = vi.fn();
      status.subscribe(told);
      expect(await mailState(status)).toBe("connected");

      const answer = await accounts.disconnect(accountRef);

      expect(answer).toEqual({ kind: "ended" });
      expect(await mailState(status)).toBe("not-connected");
      expect(await google.tokens.get(refreshTokenName(accountRef))).toBeNull();
      expect(await google.clientSecrets.readClientSecret(clientRef)).toBeNull();
      expect(await google.setups.read(accountRef).catch(() => null)).toBeNull();
      expect(told).toHaveBeenCalled();
    });

    it("still removes the sign-in and says so when Google can't be reached", async () => {
      const { google, accountRef, transport } = await hostWithSignedInAccount();
      const { accounts, status } = appOver(transport);
      googleAnswers = "is unreachable";

      const answer = await accounts.disconnect(accountRef);

      expect(answer).toEqual({ kind: "google-unreachable" });
      expect(await mailState(status)).toBe("not-connected");
      expect(await google.tokens.get(refreshTokenName(accountRef))).toBeNull();
    });

    it("refuses an account the host doesn't know, and leaves the connected one alone", async () => {
      const { google, accountRef, transport } = await hostWithSignedInAccount();
      const { accounts, status } = appOver(transport);

      await expect(accounts.disconnect("gaccount_missing1")).rejects.toThrow(
        "Halonic couldn't finish disconnecting this account.",
      );

      expect(await mailState(status)).toBe("connected");
      expect(await google.tokens.get(refreshTokenName(accountRef))).toBe(fakeRefreshToken);
    });
  });
});
