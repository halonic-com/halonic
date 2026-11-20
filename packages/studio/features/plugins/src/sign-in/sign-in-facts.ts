import { approvedSignIns, backendSheet, type Plugin } from "@halonicjs/format";

/**
 * What the trust check line says about one sign-in, with every setting
 * filled in: where the person signs in, where Halonic gets the tokens, why
 * each scope is asked for and where the token may go.
 */
export interface SignInFacts {
  /** The sign-in's name, as the sheet writes it. */
  readonly signIn: string;
  /** What the sign-in is for, in the sheet's words. Plugin text: show it as plain text. */
  readonly purpose: string;
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
 * The plugin's sign-ins, as the page shows them.
 * - `resolved`: each sign-in's facts, in the sheet's order. Empty without sign-ins.
 * - `settingsNeeded`: a setting a sign-in reads (a client ID or a server address)
 *   is missing or wrong, so its hosts aren't known yet; only the names and
 *   purposes can be shown.
 */
export type PluginSignInFacts =
  | { readonly kind: "resolved"; readonly signIns: readonly SignInFacts[] }
  | {
      readonly kind: "settingsNeeded";
      readonly signIns: readonly { readonly signIn: string; readonly purpose: string }[];
    };

/**
 * The facts of a plugin's sign-ins, from its backend's sheet and the
 * settings it has now: the same resolution the host approves and saves with
 * the grant (`approvedSignIns`), so the page shows what will be used.
 *
 * @param settings - the plugin's setting values now, by name
 *
 * @example
 * signInFacts(gitlab, { server: "https://git.example.com", clientId: "abc" });
 * // { kind: "resolved", signIns: [{ signIn: "account", authorizeHost: "git.example.com", … }] }
 */
export function signInFacts(
  plugin: Plugin,
  settings: Readonly<Record<string, unknown>>,
): PluginSignInFacts {
  const sheet = backendSheet(plugin);
  if (sheet === undefined) return { kind: "resolved", signIns: [] };
  const declared = Object.entries(sheet.signIns);
  const approved = approvedSignIns(sheet, settings);
  if (!approved.ok) {
    return {
      kind: "settingsNeeded",
      signIns: declared.map(([signIn, { purpose }]) => ({ signIn, purpose })),
    };
  }
  return {
    kind: "resolved",
    signIns: declared.flatMap(([signIn, declaredSignIn]) => {
      const resolved = approved.value[signIn];
      if (resolved === undefined) return [];
      return [
        {
          signIn,
          purpose: declaredSignIn.purpose,
          authorizeHost: new URL(resolved.authorizeUrl).host,
          tokenHost: new URL(resolved.tokenUrl).host,
          scopeReasons: declaredSignIn.scopes.map((scope) => scope.reason),
          accessHosts: resolved.accessHosts,
        },
      ];
    }),
  };
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
export function tokenHostDiffers(facts: SignInFacts): boolean {
  if (facts.authorizeHost === facts.tokenHost) return false;
  return !knownHostPairs.some(
    ([authorize, token]) => facts.authorizeHost === authorize && facts.tokenHost === token,
  );
}
