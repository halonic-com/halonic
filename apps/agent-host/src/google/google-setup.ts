import { join } from "node:path";
import { FileRecordStore } from "@halonicjs/adapter-fs-node";
import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import { createTokenStore } from "@halonicjs/adapter-token-store";
import { clientSecretStore, setupRecords } from "@halonicjs/google-setup";
import type { GoogleSetupPorts } from "@halonicjs/host-server";
import type { HttpClient } from "@halonicjs/ports";
import type { ProfileFolder } from "@halonicjs/profile";
import { randomIds, systemClock } from "@halonicjs/std";
import { tokenKeySecrets, webCryptoDigest } from "../profile-token-key.ts";
import { proxySetting } from "../proxy-setting.ts";
import { googleAccountActions } from "./google-actions.ts";
import { workspaceConnectorSource } from "./workspace-connector-source.ts";

/** What the host builds its Google setup from. */
export interface GoogleSetupOptions {
  /** The profile the host serves: the setup records and the sealed tokens live in its `google` folder. */
  profile: ProfileFolder;
  /** The host's own environment, where `HALONIC_SECRET_TOKEN_KEY` may be set. */
  env: Readonly<Record<string, string | undefined>>;
  /** The folders the launcher named as workspaces: a setup's connector is read from the one its record names. */
  workspaceRoots?: readonly string[];
  /** Talks to Google; a client that reaches Google's own hosts only, by default. */
  http?: HttpClient;
}

/** Only Google's own hosts, over `https`. */
function googleHostClass(url: URL) {
  return url.protocol === "https:" && url.hostname.endsWith(".googleapis.com")
    ? ("public" as const)
    : undefined;
}

/**
 * What the Google routes work with, over the profile's `google` folder, the
 * same one the CLI's `halonic google` commands use. Nothing is created until
 * something is saved.
 *
 * Each setup's subject is read from the connector its record is linked to,
 * in the served workspace the record names.
 */
export function openGoogleSetup(options: GoogleSetupOptions): GoogleSetupPorts {
  const clock = systemClock;
  const ids = randomIds((count) => crypto.getRandomValues(new Uint8Array(count)), clock);
  const googleFolder = join(options.profile.root, "google");
  const tokens = createTokenStore({
    records: new FileRecordStore(join(googleFolder, "tokens")),
    secrets: tokenKeySecrets(options.profile, options.env),
    clock,
  });
  const http =
    options.http ?? createNodeHttpClient({ hostClass: googleHostClass, proxy: proxySetting });
  const setups = setupRecords({
    records: new FileRecordStore(join(googleFolder, "setups")),
    clock,
    ids,
  });
  const clientSecrets = clientSecretStore(tokens, ids);
  return {
    setups,
    clientSecrets,
    tokens,
    actions: googleAccountActions({ http, tokens, clientSecrets, clock }),
    source: workspaceConnectorSource({
      setups,
      profile: options.profile,
      workspaceRoots: options.workspaceRoots ?? [],
      digest: webCryptoDigest,
    }),
    signInEvents: { publish: () => undefined },
  };
}
