import { type IntegrationSheet, parseIntegrationSheet } from "@halonicjs/format";
import { createSignInHost, type SignInHost } from "@halonicjs/host-integration-sign-in";
import { createSignInGrants, signInsInTokenNames } from "@halonicjs/oauth-sign-in";
import type { Clock } from "@halonicjs/ports";
import { PluginRefusal } from "../plugin/plugin-refusal.ts";
import { signInIntegration } from "./app-sign-in-integration.ts";

/** The workspace secret the person picked for the sheet's client secret. */
export const pickedClientSecret = "workspace-client-secret";

/** What the helper needs of the fake OAuth server; the rig's own server has more. */
export interface RigServer {
  readonly http: Parameters<typeof createSignInHost>[0]["http"];
  readonly clientId: string;
  readonly clientSecret?: string | undefined;
}

/**
 * The sign-in rig (`@halonicjs/testing-sign-in`), as the helper uses it. The
 * test files import the rig and pass it in, because the layer check allows a
 * testing package only in `.test.ts` files, not in this helper.
 */
export interface SignInRig<Server extends RigServer = RigServer> {
  readonly clientSecretName: string;
  readonly webDigest: Parameters<typeof createSignInHost>[0]["digest"];
  exampleSheetRecord(): Record<string, unknown>;
  createFakeOAuthServer(options: { clock: Clock }): Server;
}

/** The example integration's sheet, from the rig's record. */
export function exampleSheet(rig: Pick<SignInRig, "exampleSheetRecord">): IntegrationSheet {
  const parsed = parseIntegrationSheet(rig.exampleSheetRecord());
  if (!parsed.ok) throw new Error(`the example sheet is wrong: ${JSON.stringify(parsed.error)}`);
  return parsed.value;
}

/** The sign-in host of one integration, `example`, over the fake OAuth server. */
export interface ExampleSignInHost<Server extends RigServer = RigServer> {
  readonly host: SignInHost;
  readonly server: Server;
  /** Replaces the settings the person chose for the integration. */
  changeSettings(settings: Record<string, unknown>): void;
  /** Takes the client secret out of the workspace's secrets. */
  forgetClientSecret(): void;
  /** Picks another workspace secret for the client secret. */
  pickClientSecret(name: string): void;
  /** Takes the trust away, or gives it back, as for a plugin: untrusted, neither the sheet nor a secret can be read. */
  setTrusted(trusted: boolean): void;
  /** The token names of the grants saved now. */
  savedTokenNames(): string[];
}

/**
 * The real sign-in host, built from the app's one source the way the app
 * builds it (`signInIntegration`), with the fake OAuth server for the
 * network. Only the network and the browser are fake.
 */
export function exampleSignInHost<Server extends RigServer>(
  rig: SignInRig<Server>,
): ExampleSignInHost<Server> {
  const clock: Clock = { now: () => new Date(Date.UTC(2026, 10, 13)) };
  const server = rig.createFakeOAuthServer({ clock });
  const store = new Map<string, string>();
  const workspace = new Map<string, string>([[pickedClientSecret, server.clientSecret ?? ""]]);
  let choices = {
    settings: { clientId: server.clientId } as Record<string, unknown>,
    secretNames: { [rig.clientSecretName]: pickedClientSecret } as Record<string, string>,
  };
  let trusted = true;
  const integration = signInIntegration(
    { get: async (name) => workspace.get(name) ?? null },
    {
      read: async () => {
        if (!trusted) throw new PluginRefusal("plugin_not_trusted");
        return { sheet: exampleSheet(rig), choices };
      },
    },
  );
  const host = createSignInHost({
    integration: (name) => (name === "example" ? integration : undefined),
    grants: createSignInGrants(
      {
        get: async (name) => store.get(name) ?? null,
        set: async (name, value) => void store.set(name, value),
        remove: async (name) => void store.delete(name),
      },
      rig.webDigest,
    ),
    savedSignIns: async (name) => signInsInTokenNames(name, store.keys()),
    http: server.http,
    clock,
    digest: rig.webDigest,
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
      choices = { ...choices, secretNames: { [rig.clientSecretName]: name } };
    },
    setTrusted(value) {
      trusted = value;
    },
    savedTokenNames: () => [...store.keys()],
  };
}
