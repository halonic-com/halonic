import type { Plugin } from "@halonicjs/format";

/** A host as a sheet writes it: fixed, or read from a setting. */
export type DeclaredHost = string | { readonly fromSetting: string };

/**
 * Where a sign-in's client secret may go: the hosts of the token URL and the
 * revoke URL of the sign-in that names it, and no others. A client secret has
 * no `hosts` of its own, because Halonic's sign-in code sends it, not the
 * plugin's; the host's policy (`integrationPolicy`) allows it exactly these.
 *
 * @returns the hosts in the sheet's order, without repeats; none when no sign-in names the secret
 *
 * @example
 * clientSecretHosts(gitlab, "gitlab-client"); // [{ fromSetting: "server" }]
 */
export function clientSecretHosts(plugin: Plugin, secret: string): DeclaredHost[] {
  const urls = Object.values(plugin.backend?.signIns ?? {})
    .filter((signIn) => signIn.clientSecret === secret)
    .flatMap((signIn) =>
      signIn.revokeUrl === undefined ? [signIn.tokenUrl] : [signIn.tokenUrl, signIn.revokeUrl],
    );
  const byKey = new Map<string, DeclaredHost>();
  for (const url of urls) {
    const host = hostOf(url);
    byKey.set(typeof host === "string" ? host : `setting:${host.fromSetting}`, host);
  }
  return [...byKey.values()];
}

/** A sign-in URL's host: the host of a fixed URL, or the setting a `{ fromSetting }` one reads. */
function hostOf(url: string | { readonly fromSetting: string }): DeclaredHost {
  return typeof url === "string" ? new URL(url).host : { fromSetting: url.fromSetting };
}

/** The client secrets of a plugin's backend: the secrets a sign-in names, in the sheet's order. */
export function clientSecretNames(plugin: Plugin): string[] {
  const named = new Set(
    Object.values(plugin.backend?.signIns ?? {}).flatMap((signIn) =>
      signIn.clientSecret === undefined ? [] : [signIn.clientSecret],
    ),
  );
  return Object.keys(plugin.backend?.secrets ?? {}).filter((name) => named.has(name));
}
