// The words of a plugin's sign-in in a trust check, as the board approved
// them on HAL-8619 (HAL-984 design section 6): the trust check line and the
// token host warning. Studio's plugin page shows them before **Sign in**, and
// the trust check of `halonic plugin add` and Studio shows them in its
// Sign-ins section (the designer, HAL-13419), so the words live here once.
// The plugin's own text (its name, a purpose, a scope's reason) and its hosts
// are only ever values: each host escapes them as it shows them.

import type { IntegrationSignIn, Plugin } from "@halonicjs/format";

/** A host as a sheet writes it: fixed, or read from a setting. */
export type PluginDeclaredHost = string | { readonly fromSetting: string };

/**
 * What the trust check line says about one sign-in. A host is a host name
 * once the settings are known, or the words a check uses for a host a
 * setting holds, such as "the address in Server".
 */
export interface SignInTrustFacts {
  /** The host of the page the person signs in on. */
  readonly authorizeHost: string;
  /** The host Halonic asks for the tokens. */
  readonly tokenHost: string;
  /** Why each scope is asked for, in the sheet's words and order. Plugin text. */
  readonly scopeReasons: readonly string[];
  /** The hosts the access token may go to. */
  readonly accessHosts: readonly string[];
}

/**
 * A sign-in's facts as its sheet declares it, before any setting is filled
 * in: each host as written, or the setting that holds it, put into words by
 * `hostWords`. The trust check uses it, since a plugin is trusted before its
 * settings are set.
 *
 * @example
 * declaredSignInTrustFacts(gitlabSignIn, (host) => typeof host === "string" ? host : `the address in ${host.fromSetting}`);
 * // { authorizeHost: "the address in server", tokenHost: "the address in server", … }
 */
export function declaredSignInTrustFacts(
  signIn: IntegrationSignIn,
  hostWords: (host: PluginDeclaredHost) => string,
): SignInTrustFacts {
  return {
    authorizeHost: hostWords(urlHost(signIn.authorizeUrl)),
    tokenHost: hostWords(urlHost(signIn.tokenUrl)),
    scopeReasons: signIn.scopes.map((scope) => scope.reason),
    accessHosts: [...new Set(signIn.access.hosts.map(hostWords))],
  };
}

/** The host of a sign-in URL the sheet check accepted: `https://`, an exact host without a port, then a path. */
const signInUrlHost = /^https:\/\/([^/?#]+)/;

/**
 * A sign-in URL's host: the host of a fixed URL, or the setting a
 * `{ fromSetting }` one reads. The core has no `URL` class; the sheet check
 * (`SIGN_IN_URL_PATTERN`) already allows only an exact host there.
 */
function urlHost(url: IntegrationSignIn["tokenUrl"]): PluginDeclaredHost {
  if (typeof url !== "string") return { fromSetting: url.fromSetting };
  return signInUrlHost.exec(url)?.[1] ?? url;
}

const list = new Intl.ListFormat("en-GB", { type: "conjunction" });

/**
 * The trust check line: "Signs in to your Acme account at auth.example.com.
 * Halonic gets the tokens from auth.example.com. It can: read your projects.
 * The sign-in is used only with api.example.com."
 *
 * A sign-in that asks for no scopes leaves out "It can: …".
 *
 * @param service - the plugin's name
 */
export function signInTrustLine(service: string, facts: SignInTrustFacts): string {
  const can = facts.scopeReasons.length === 0 ? "" : ` It can: ${facts.scopeReasons.join("; ")}.`;
  return (
    `Signs in to your ${service} account at ${facts.authorizeHost}. ` +
    `Halonic gets the tokens from ${facts.tokenHost}.${can} ` +
    `The sign-in is used only with ${list.format(facts.accessHosts)}.`
  );
}

/** The token host warning, when the sign-in page and the token address are different services. */
export function signInTokenHostWarning(facts: SignInTrustFacts): string {
  return (
    `The sign-in page and the token address are different services: ` +
    `${facts.authorizeHost} and ${facts.tokenHost}. Only continue if you expect that.`
  );
}

/**
 * Sign-in pages whose tokens come from another host of the same provider by
 * design, so the token host warning would only worry the person. Google signs
 * in on accounts.google.com and gives tokens from oauth2.googleapis.com.
 */
const knownHostPairs: readonly (readonly [authorize: string, token: string])[] = [
  ["accounts.google.com", "oauth2.googleapis.com"],
];

/**
 * Whether the sign-in page and the token address are different services
 * the person should know about: different hosts that aren't a known pair.
 */
export function signInTokenHostDiffers(facts: SignInTrustFacts): boolean {
  if (facts.authorizeHost === facts.tokenHost) return false;
  return !knownHostPairs.some(
    ([authorize, token]) => facts.authorizeHost === authorize && facts.tokenHost === token,
  );
}

/**
 * Where a sign-in's client secret may go: the hosts of the token URL and the
 * revoke URL of the sign-in that names it, and no others. A client secret has
 * no `hosts` of its own, because Halonic's sign-in code sends it, not the
 * plugin's; the host's policy (`integrationPolicy`) allows it exactly these.
 *
 * @returns the hosts in the sheet's order, without repeats; none when no sign-in names the secret
 *
 * @example
 * pluginClientSecretHosts(gitlab, "gitlab-client"); // [{ fromSetting: "server" }]
 */
export function pluginClientSecretHosts(plugin: Plugin, secret: string): PluginDeclaredHost[] {
  const urls = Object.values(plugin.backend?.signIns ?? {})
    .filter((signIn) => signIn.clientSecret === secret)
    .flatMap((signIn) =>
      signIn.revokeUrl === undefined ? [signIn.tokenUrl] : [signIn.tokenUrl, signIn.revokeUrl],
    );
  const byKey = new Map<string, PluginDeclaredHost>();
  for (const url of urls) {
    const host = urlHost(url);
    byKey.set(typeof host === "string" ? host : `setting:${host.fromSetting}`, host);
  }
  return [...byKey.values()];
}

/** The client secrets of a plugin's backend: the secrets a sign-in names, in the sheet's order. */
export function pluginClientSecretNames(plugin: Plugin): string[] {
  const named = new Set(
    Object.values(plugin.backend?.signIns ?? {}).flatMap((signIn) =>
      signIn.clientSecret === undefined ? [] : [signIn.clientSecret],
    ),
  );
  return Object.keys(plugin.backend?.secrets ?? {}).filter((name) => named.has(name));
}
