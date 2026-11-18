import { type IntegrationSheet, parseIntegrationSheet } from "@halonicjs/format";
import { createSignInHost, type SignInHost } from "@halonicjs/host-integration-sign-in";
import { createSignInGrants } from "@halonicjs/oauth-sign-in";
import type { Clock } from "@halonicjs/ports";
import {
  clientSecretName,
  createFakeOAuthServer,
  exampleSheetRecord,
  type FakeOAuthServer,
  webDigest,
} from "@halonicjs/testing-sign-in";
import { signInIntegration } from "./app-sign-in-integration.ts";

/** The workspace secret the person picked for the sheet's client secret. */
export const pickedClientSecret = "workspace-client-secret";

/** The example integration's sheet, from the rig's record. */
export function exampleSheet(): IntegrationSheet {
  const parsed = parseIntegrationSheet(exampleSheetRecord());
  if (!parsed.ok) throw new Error(`the example sheet is wrong: ${JSON.stringify(parsed.error)}`);
  return parsed.value;
}

/** The sign-in host of one integration, `example`, over the fake OAuth server. */
export interface ExampleSignInHost {
  readonly host: SignInHost;
  readonly server: FakeOAuthServer;
  /** Replaces the settings the person chose for the integration. */
  changeSettings(settings: Record<string, unknown>): void;
  /** Takes the client secret out of the workspace's secrets. */
  forgetClientSecret(): void;
  /** Picks another workspace secret for the client secret. */
  pickClientSecret(name: string): void;
}

/**
 * The real sign-in host, built from the app's one source the way the app
 * builds it (`signInIntegration`), with the fake OAuth server for the
 * network. Only the network and the browser are fake.
 */
export function exampleSignInHost(): ExampleSignInHost {
  const clock: Clock = { now: () => new Date(Date.UTC(2026, 10, 13)) };
  const server = createFakeOAuthServer({ clock });
  const store = new Map<string, string>();
  const workspace = new Map<string, string>([[pickedClientSecret, server.clientSecret ?? ""]]);
  let choices = {
    settings: { clientId: server.clientId } as Record<string, unknown>,
    secretNames: { [clientSecretName]: pickedClientSecret } as Record<string, string>,
  };
  const integration = signInIntegration(
    { get: async (name) => workspace.get(name) ?? null },
    { read: async () => ({ sheet: exampleSheet(), choices }) },
  );
  const host = createSignInHost({
    integration: (name) => (name === "example" ? integration : undefined),
    grants: createSignInGrants(
      {
        get: async (name) => store.get(name) ?? null,
        set: async (name, value) => void store.set(name, value),
        remove: async (name) => void store.delete(name),
      },
      webDigest,
    ),
    http: server.http,
    clock,
    digest: webDigest,
    randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
    requestSignal: () => new AbortController().signal,
  });
  return {
    host,
    server,
    changeSettings(settings) {
      choices = { ...choices, settings };
    },
    forgetClientSecret() {
      workspace.delete(pickedClientSecret);
    },
    pickClientSecret(name) {
      choices = { ...choices, secretNames: { [clientSecretName]: name } };
    },
  };
}
