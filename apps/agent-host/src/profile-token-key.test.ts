import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileRecordStore } from "@halonicjs/adapter-fs-node";
import { FileSecretStore } from "@halonicjs/adapter-secrets-file";
import { createTokenStore, tokenKeySecret } from "@halonicjs/adapter-token-store";
import { type ProfileFolder, secretsFile, tokenFolders } from "@halonicjs/profile";
import { encodeBase64url, systemClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { openGoogleSetup } from "./google/google-setup.ts";
import { tokenKeySecrets } from "./profile-token-key.ts";

// Invented values only: none is a real key, token or client secret.
const envKey = encodeBase64url(new Uint8Array(32).fill(7));
const fakeClientSecret = "fake-client-secret-0000000001";

let profile: ProfileFolder;

beforeEach(async () => {
  profile = {
    platform: process.platform === "win32" ? "windows" : "linux",
    root: await mkdtemp(join(tmpdir(), "halonic-profile-token-key-")),
  };
});

afterEach(() => rm(profile.root, { recursive: true, force: true }));

const storedKey = () => new FileSecretStore(secretsFile(profile)).get(tokenKeySecret);

/** The token store in `folder`, with the key the host reads from `env`. */
function tokensIn(folder: string, env: Record<string, string> = {}) {
  return createTokenStore({
    records: new FileRecordStore(folder),
    secrets: tokenKeySecrets(profile, env),
    clock: systemClock,
  });
}

verifies("agent-host.profile-token-key", () => {
  it("makes the key in a fresh profile's secrets file, and opens the secret with it after a restart", async () => {
    const google = openGoogleSetup({ profile, env: {} });

    const clientRef = await google.clientSecrets.saveClientSecret(fakeClientSecret);

    expect(await storedKey()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const restarted = openGoogleSetup({ profile, env: {} });
    expect(await restarted.clientSecrets.readClientSecret(clientRef)).toBe(fakeClientSecret);
  });

  it("uses HALONIC_SECRET_TOKEN_KEY as it is and saves no key", async () => {
    const google = openGoogleSetup({ profile, env: { HALONIC_SECRET_TOKEN_KEY: envKey } });

    const clientRef = await google.clientSecrets.saveClientSecret(fakeClientSecret);

    expect(await storedKey()).toBeNull();
    const withEnvKey = openGoogleSetup({ profile, env: { HALONIC_SECRET_TOKEN_KEY: envKey } });
    expect(await withEnvKey.clientSecrets.readClientSecret(clientRef)).toBe(fakeClientSecret);
  });

  it("gives the Google setup and the integration sign-ins one key", async () => {
    const folders = tokenFolders(profile);

    await Promise.all([
      tokensIn(folders.google).set("google-refresh", "fake-token-a"),
      tokensIn(folders.integrationSignIns).set("grant", "fake-token-b"),
    ]);

    expect(await tokensIn(folders.google).get("google-refresh")).toBe("fake-token-a");
    expect(await tokensIn(folders.integrationSignIns).get("grant")).toBe("fake-token-b");
  });
});
