import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProfileFolder } from "@halonicjs/profile";
import { encodeBase64url } from "@halonicjs/std";
import type { FakeOAuthServer } from "@halonicjs/testing-sign-in";
import * as rig from "@halonicjs/testing-sign-in";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signInIntegration } from "./app-sign-in-integration.ts";
import { hostIntegrationSignIns, openHostSignIns } from "./host-sign-ins.ts";
import { exampleSheet, pickedClientSecret } from "./sign-in-test-kit.test-helper.ts";

const tokenKey = encodeBase64url(new Uint8Array(32).fill(7));

let profile: ProfileFolder;

beforeEach(async () => {
  profile = { platform: "linux", root: await mkdtemp(join(tmpdir(), "halonic-sign-ins-")) };
});

afterEach(async () => {
  await rm(profile.root, { recursive: true, force: true });
});

/** The profile's sign-in host with the example integration, over the fake provider. */
function opened(server: FakeOAuthServer) {
  const integration = signInIntegration(
    { get: async (name) => (name === pickedClientSecret ? (server.clientSecret ?? "") : null) },
    {
      read: async () => ({
        sheet: exampleSheet(rig),
        choices: {
          settings: { clientId: server.clientId },
          secretNames: { [rig.clientSecretName]: pickedClientSecret },
        },
      }),
    },
  );
  return openHostSignIns({
    profile,
    env: { HALONIC_SECRET_TOKEN_KEY: tokenKey },
    integration: (name) => (name === "example" ? integration : undefined),
    ownPorts: () => [],
    http: server.http,
  });
}

/** Every file under `folder`, as text. */
async function filesUnder(folder: string): Promise<string[]> {
  const names = await readdir(folder, { recursive: true, withFileTypes: true });
  return await Promise.all(
    names
      .filter((entry) => entry.isFile())
      .map((entry) => readFile(join(entry.parentPath, entry.name), "utf8")),
  );
}

describe("openHostSignIns", () => {
  it("keeps a grant in the profile, sealed, so the next host start finds it signed in", async () => {
    const server = rig.createFakeOAuthServer({ clock: { now: () => new Date() } });
    const first = opened(server);
    const parts = first.integration("example");
    const started = await parts?.flow.start(rig.signInName, 4321);
    if (started?.kind !== "started") throw new Error("the sign-in didn't start");
    const callback = server.approve(started.authorizeUrl);
    expect((await first.handleCallback(new Request(callback))).status).toBe(200);

    const next = opened(server).integration("example");
    expect(await next?.status()).toEqual([{ signIn: rig.signInName, state: "signedIn" }]);
    const files = await filesUnder(join(profile.root, "integration-sign-ins", "tokens"));
    expect(files.length).toBeGreaterThan(0);
    const refreshTokens = server.ledger.grants.flatMap((grant) => grant.refreshTokens);
    expect(refreshTokens.length).toBeGreaterThan(0);
    for (const token of refreshTokens) {
      for (const file of files) expect(file).not.toContain(token);
    }
  });

  it("creates nothing in the profile until a sign-in saves its grant", async () => {
    const server = rig.createFakeOAuthServer({ clock: { now: () => new Date() } });
    expect(await opened(server).integration("example")?.status()).toEqual([
      { signIn: rig.signInName, state: "signedOut" },
    ]);
    expect(await readdir(profile.root)).toEqual([]);
  });

  it("runs no sign-ins for an integration the app doesn't give", () => {
    const host = openHostSignIns({
      profile,
      env: {},
      integration: () => undefined,
      ownPorts: () => [],
    });
    expect(host.integration("example")).toBeUndefined();
  });
});

describe("hostIntegrationSignIns", () => {
  it("has no sign-ins and serves no route without a profile folder", () => {
    const signIns = hostIntegrationSignIns({
      profile: undefined,
      relayPort: undefined,
      integration: () => expect.fail("asked for an integration without a profile"),
      ownPorts: () => [],
      log: () => undefined,
    });
    expect(signIns).toEqual({ host: undefined, routes: [] });
  });
});
