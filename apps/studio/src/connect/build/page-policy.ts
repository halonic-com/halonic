/**
 * The connect page's content security policy (D7 design, B7 item 4, HAL-15159): the page may load
 * only its own files and talk only to the shell through Tauri's IPC, so it has no way onto the
 * network. The same policy is in two places, and the webview enforces both: the `<meta>` tag in
 * `connect.html`, and `app.security.csp` in `tauri.android.conf.json`, which Tauri sends with the
 * page.
 */
export const connectPagePolicy =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; " +
  "connect-src ipc: http://ipc.localhost; object-src 'none'; base-uri 'none'; form-action 'none'; " +
  "frame-src 'none'; frame-ancestors 'none'";

/** Where Tauri's IPC is on Android, the only `http:` source the page may name (in `connect-src`). */
const androidIpcOrigin = "http://ipc.localhost";

/** The sources that would let a script run that isn't one of the page's own files. */
const unsafeScriptSources = new Set(["'unsafe-inline'", "'unsafe-eval'", "blob:", "data:"]);

/** A hash or nonce source, which Tauri adds to `script-src` for the scripts it injects. */
const hashOrNonce = /^'(?:sha256|sha384|sha512|nonce)-[A-Za-z0-9+/_=-]+'$/u;

/** The schemes whose scheme-only source (`https:`) allows every address on the network. */
const networkSchemes = new Set(["http", "https", "ws", "wss"]);

/**
 * Whether a source lets the page reach an address: `*`, a host (`192.168.1.20:4280`), a URL, or
 * a network scheme on its own. Keywords, hashes and nonces are quoted, and other scheme-only
 * sources (`ipc:`, `data:`) name no address.
 */
function reachesNetwork(source: string): boolean {
  if (source.startsWith("'")) return false;
  const schemeOnly = /^([a-z][a-z0-9+.-]*):$/iu.exec(source);
  if (schemeOnly?.[1] !== undefined) return networkSchemes.has(schemeOnly[1].toLowerCase());
  return true;
}

/** A policy's directives by name, each with its sources in order. */
export type PolicyDirectives = ReadonlyMap<string, readonly string[]>;

/**
 * Reads a policy into its directives. Directive names are case-insensitive, so they are kept in
 * lower case; sources are kept as written.
 *
 * @param policy - the policy text, as in a `<meta>` tag or a Tauri config
 */
export function policyDirectives(policy: string): PolicyDirectives {
  const directives = new Map<string, readonly string[]>();
  for (const part of policy.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/u);
    if (name === undefined || name === "") continue;
    directives.set(name.toLowerCase(), sources);
  }
  return directives;
}

/** What {@link policyProblems} accepts beyond {@link connectPagePolicy}. */
export interface PolicyAllowance {
  /**
   * Allow hash and nonce sources in `script-src`: Tauri adds them to the policy it sends for the
   * scripts it injects itself (Liam, on signing D7). The `<meta>` tag never needs them.
   */
  readonly scriptHashes: boolean;
}

/**
 * Says what is wrong with a policy for the connect page, or nothing when it is exactly
 * {@link connectPagePolicy}. Besides any difference from that policy, it names each source that
 * would open the page to the network or to a script of someone else's, so a reader sees why.
 *
 * @param policy - the policy text, as in a `<meta>` tag or the policy Tauri sends
 * @param allowance - what may come on top of the exact policy
 * @returns one sentence per problem, empty when the policy is right
 */
export function policyProblems(policy: string, allowance: PolicyAllowance): string[] {
  const found = policyDirectives(policy);
  return [...unsafeSourceProblems(found), ...differenceProblems(found, allowance)];
}

/** The sources B7 item 4 rules out in any policy, whatever the expected one says. */
function unsafeSourceProblems(found: PolicyDirectives): string[] {
  const problems: string[] = [];
  for (const [name, sources] of found) {
    for (const source of sources) {
      if (name === "script-src" && unsafeScriptSources.has(source.toLowerCase())) {
        problems.push(
          `script-src allows ${source}, which runs scripts that aren't the page's own files.`,
        );
      } else if (
        reachesNetwork(source) &&
        !(name === "connect-src" && source === androidIpcOrigin)
      ) {
        problems.push(`${name} allows ${source}, which reaches the network.`);
      }
    }
  }
  return problems;
}

/** How a policy differs from {@link connectPagePolicy}, directive by directive. */
function differenceProblems(found: PolicyDirectives, allowance: PolicyAllowance): string[] {
  const expected = policyDirectives(connectPagePolicy);
  const problems: string[] = [];
  for (const [name, sources] of expected) {
    const actual = found.get(name);
    if (actual === undefined) {
      problems.push(`The policy has no ${name}; it should be "${sources.join(" ")}".`);
      continue;
    }
    const extra = actual.filter(
      (source) =>
        !sources.includes(source) &&
        !(allowance.scriptHashes && name === "script-src" && hashOrNonce.test(source)),
    );
    const missing = sources.filter((source) => !actual.includes(source));
    if (extra.length > 0 || missing.length > 0) {
      problems.push(`${name} is "${actual.join(" ")}"; it should be "${sources.join(" ")}".`);
    }
  }
  for (const name of found.keys()) {
    if (!expected.has(name))
      problems.push(`The policy has a ${name} that the connect page's policy doesn't.`);
  }
  return problems;
}

/** The policy in a page's `<meta http-equiv="Content-Security-Policy">` tags, one entry per tag. */
export function metaPolicies(html: string): string[] {
  const policies: string[] = [];
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/giu)) {
    if (!/http-equiv\s*=\s*["']content-security-policy["']/iu.test(tag)) continue;
    const content =
      /\bcontent\s*=\s*"([^"]*)"/iu.exec(tag) ?? /\bcontent\s*=\s*'([^']*)'/iu.exec(tag);
    policies.push(content?.[1] ?? "");
  }
  return policies;
}
