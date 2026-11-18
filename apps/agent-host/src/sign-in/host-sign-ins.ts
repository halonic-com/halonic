import { join } from "node:path";
import { FileRecordStore } from "@halonicjs/adapter-fs-node";
import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import { createTokenStore } from "@halonicjs/adapter-token-store";
import {
  createSignInHost,
  type SignInHost,
  type SignInIntegration,
} from "@halonicjs/host-integration-sign-in";
import { createSignInGrants, tokenRequestTimeoutMs } from "@halonicjs/oauth-sign-in";
import type { HttpClient } from "@halonicjs/ports";
import type { ProfileFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import { tokenKeySecrets, webCryptoDigest } from "../profile-token-key.ts";
import { proxySetting } from "../proxy-setting.ts";
import type { HostRoute } from "../server/host-server.ts";
import { integrationSignInRoutes } from "./sign-in-routes.ts";

/** What the host builds its integration sign-ins from. */
export interface HostSignInsOptions {
  /** The profile the host serves: the sealed grants live in its `integration-sign-ins` folder. */
  readonly profile: ProfileFolder;
  /** The host's own environment, where `HALONIC_SECRET_TOKEN_KEY` may be set. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The integration called `name`, built with `signInIntegration`, or `undefined` when the host runs no sign-ins for it. */
  integration(name: string): SignInIntegration | undefined;
  /** Halonic's own ports on this computer, which no token or revoke request may reach. */
  ownPorts(): Iterable<number>;
  /** Talks to the providers; the Node client for public hosts, without redirects, by default. */
  readonly http?: HttpClient;
}

/**
 * The app runs no integration that may hold a sign-in yet: a local
 * integration's sheet can't declare one (`sign-ins-not-allowed`) until Studio
 * shows its sign-in hosts. Until then every sign-in route answers
 * `unknown_integration`.
 */
export const noSignInIntegrations = (): undefined => undefined;

/**
 * The integration sign-ins of the profile the host serves. The grants are
 * sealed with the profile's token key, as Google's tokens are, in a folder of
 * their own. Nothing is created until a sign-in saves its grant.
 *
 * @example
 * const signIns = openHostSignIns({ profile, env: process.env, integration: noSignInIntegrations, ownPorts });
 * routes.push(...integrationSignInRoutes({ signIns }));
 */
export function openHostSignIns(options: HostSignInsOptions): SignInHost {
  const clock = systemClock;
  const tokens = createTokenStore({
    records: new FileRecordStore(join(options.profile.root, "integration-sign-ins", "tokens")),
    secrets: tokenKeySecrets(options.profile, options.env),
    clock,
  });
  const http =
    options.http ??
    createNodeHttpClient({
      hostClass: () => "public",
      ownPorts: options.ownPorts,
      maxRedirects: 0,
      proxy: proxySetting,
    });
  return createSignInHost({
    integration: (name) => options.integration(name),
    grants: createSignInGrants(tokens, webCryptoDigest),
    http,
    clock,
    digest: webCryptoDigest,
    randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
    requestSignal: () => AbortSignal.timeout(tokenRequestTimeoutMs),
  });
}

/** What {@link hostIntegrationSignInRoutes} needs from the host. */
export interface HostSignInRoutesOptions {
  /** The profile folder, or `undefined` without one: then no sign-in route is served. */
  readonly profile: ProfileFolder | undefined;
  /** The relay's port in `--stdio` mode, where an integration's sign-in can't start yet. */
  readonly relayPort: number | undefined;
  /** The host's own ports, which no provider's address may name. */
  ownPorts(): Iterable<number>;
  readonly log: (text: string) => void;
}

/**
 * The routes of the integrations' sign-ins, over the profile's grants; none
 * without a profile folder.
 */
export function hostIntegrationSignInRoutes(options: HostSignInRoutesOptions): HostRoute[] {
  if (options.profile === undefined) return [];
  const signIns = openHostSignIns({
    profile: options.profile,
    env: process.env,
    integration: noSignInIntegrations,
    ownPorts: options.ownPorts,
  });
  return integrationSignInRoutes({
    signIns,
    log: options.log,
    ...(options.relayPort === undefined ? {} : { relayPort: options.relayPort }),
  });
}
