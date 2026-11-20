import { type SignInTrustFacts, signInTokenHostDiffers } from "@halonicjs/app";
import { approvedSignIns, backendSheet, type Plugin } from "@halonicjs/format";

/**
 * What the trust check line says about one sign-in, with every setting
 * filled in: where the person signs in, where Halonic gets the tokens, why
 * each scope is asked for and where the token may go.
 */
export interface SignInFacts extends SignInTrustFacts {
  /** The sign-in's name, as the sheet writes it. */
  readonly signIn: string;
  /** What the sign-in is for, in the sheet's words. Plugin text: show it as plain text. */
  readonly purpose: string;
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
 * Whether the sign-in page and the token address are different services
 * the person should know about: different hosts that aren't a known pair
 * (core's `signInTokenHostDiffers`).
 */
export function tokenHostDiffers(facts: SignInFacts): boolean {
  return signInTokenHostDiffers(facts);
}
