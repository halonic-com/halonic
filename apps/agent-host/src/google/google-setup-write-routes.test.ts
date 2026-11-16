import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshTokenName } from "@halonicjs/google-setup";
import { encodeBase64url } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { googleRoutes } from "./google-routes.ts";
import { openGoogleSetup } from "./google-setup.ts";

// Invented values only: none is a real key, token or project.
const tokenKey = encodeBase64url(new Uint8Array(32).fill(7));
const route = { app: "own", runsOn: "this-computer" } as const;
const connector = { workspace: "0123456789abcdef0123456789abcdef", id: "gmail" };

const token = randomLaunchToken();
let profileRoot: string;
let server: HostServer | undefined;

beforeEach(async () => {
  profileRoot = await mkdtemp(join(tmpdir(), "halonic-google-write-routes-"));
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await rm(profileRoot, { recursive: true, force: true });
});

async function started() {
  const google = openGoogleSetup({
    profile: { platform: "linux", root: profileRoot },
    env: { HALONIC_SECRET_TOKEN_KEY: tokenKey },
    http: { fetch: async () => new Response("{}", { status: 200 }) },
  });
  server = await startHostServer(token, googleRoutes({ google }));
  return { url: server.url, google };
}

function post(url: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

verifies("agent-host.google-setup-write-routes", () => {
  it("starts a setup that keeps the connector link", async () => {
    const { url, google } = await started();

    const response = await post(url, "/v1/google/setups", { accountType: "personal", connector });

    expect(response.status).toBe(201);
    const { accountRef } = (await response.json()) as { accountRef: string };
    expect((await google.setups.read(accountRef))?.connector).toEqual(connector);
  });

  it("refuses a start with a key it doesn't know", async () => {
    const { url } = await started();

    const response = await post(url, "/v1/google/setups", {
      accountType: "personal",
      connector,
      extra: 1,
    });

    expect(response.status).toBe(400);
  });

  it("edits a setup with a change a person makes", async () => {
    const { url, google } = await started();
    const { accountRef } = await google.setups.start({ route, accountType: "personal", connector });

    const response = await post(url, "/v1/google/setups/edit", {
      accountRef,
      change: { kind: "project-id", projectId: "acme-project" },
    });

    expect(await response.json()).toEqual({ updated: true });
    expect((await google.setups.read(accountRef))?.projectId).toBe("acme-project");
  });

  it("refuses the change a person can't make: that the account signed in", async () => {
    const { url, google } = await started();
    const { accountRef } = await google.setups.start({ route, accountType: "personal", connector });

    const response = await post(url, "/v1/google/setups/edit", {
      accountRef,
      change: { kind: "signed-in" },
    });

    expect(response.status).toBe(400);
  });

  it("answers 404 when it edits a ref with no setup", async () => {
    const { url } = await started();

    const response = await post(url, "/v1/google/setups/edit", {
      accountRef: "gaccount_missing1",
      change: { kind: "project-id", projectId: "acme-project" },
    });

    expect(response.status).toBe(404);
  });

  it("answers 404 when it starts over a ref with no setup", async () => {
    const { url } = await started();

    const response = await post(url, "/v1/google/start-over", { accountRef: "gaccount_missing1" });

    expect(response.status).toBe(404);
  });

  it.each(["../x", "a/b", "Gaccount_1", ""])("refuses the ref %j with 400", async (accountRef) => {
    const { url } = await started();

    const response = await post(url, "/v1/google/setups/edit", {
      accountRef,
      change: { kind: "in-production", ticked: true },
    });

    expect(response.status).toBe(400);
  });

  it("starts over: the record and the refresh token are gone", async () => {
    const { url, google } = await started();
    const { accountRef } = await google.setups.start({ route, accountType: "personal", connector });
    await google.tokens.set(refreshTokenName(accountRef), "fake-refresh-token-0000000001");

    const response = await post(url, "/v1/google/start-over", { accountRef });

    expect(response.status).toBe(200);
    expect(await google.tokens.get(refreshTokenName(accountRef))).toBeNull();
    expect(await google.setups.read(accountRef).catch(() => null)).toBeNull();
  });
});
