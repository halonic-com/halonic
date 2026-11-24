import { err, ok, type Result } from "@halonicjs/std";
import type { BrowserOrigin, StepperTarget } from "./stepper-types.ts";

/** Scheme, authority, path, and an optional query or fragment. The core has no `URL` class. */
const addressParts = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)([?#].*)?$/;

function escapeForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Turns `/{owner}/{repo}/settings/variables/` into a pattern where each placeholder is one segment. */
function prefixPattern(prefix: string): RegExp {
  const pieces = prefix.split(/\{[A-Za-z][A-Za-z0-9]*\}/).map(escapeForPattern);
  return new RegExp(`^${pieces.join("[^/]+")}`);
}

/** Decodes the path once, or `undefined` when it isn't valid percent-encoding. */
function decodeOnce(path: string): string | undefined {
  try {
    return decodeURIComponent(path);
  } catch {
    // A malformed escape is refused like any other path trick.
    return undefined;
  }
}

function hasPathTrick(decoded: string): boolean {
  return (
    decoded.includes("..") ||
    decoded.includes("//") ||
    decoded.includes("\\") ||
    /%2f/i.test(decoded)
  );
}

/**
 * Checks a `browser` block's address against the catalog's web origins and
 * their path prefixes (architecture note on HAL-17491, 7.1): `https` only, no
 * user name, password or port, a host on the allow-list, no query or fragment,
 * and a path that, decoded once, holds no `..`, `//`, `\` or `%2F` and starts
 * with one of the origin's prefixes. Returns the page it touches, or why not.
 *
 * @example
 * checkBrowserAddress("https://github.com/acme/app/settings/variables/actions", origins);
 * // ok({ service: "github", kind: "page", name: "github.com/acme/app/settings/variables/actions" })
 */
export function checkBrowserAddress(
  address: string,
  origins: readonly BrowserOrigin[],
): Result<StepperTarget, string> {
  const parts = addressParts.exec(address);
  if (parts === null) return err(`\`${address}\` isn't a web address`);
  const [, scheme = "", authority = "", path = "", rest] = parts;
  if (scheme.toLowerCase() !== "https")
    return err(`\`${address}\` isn't https; only https pages can be opened`);
  if (authority.includes("@")) return err(`\`${address}\` carries a user name or password`);
  if (authority.includes(":")) return err(`\`${address}\` names a port`);
  const host = authority.toLowerCase();
  const origin = origins.find((candidate) => candidate.host === host);
  if (origin === undefined)
    return err(`\`https://${host}\` isn't on the allow-list for browser steps`);
  if (rest !== undefined) return err(`\`${address}\` carries a query or fragment`);
  const decoded = decodeOnce(path);
  if (decoded === undefined || hasPathTrick(decoded)) return err(`\`${address}\` has a path trick`);
  const allowed = origin.pathPrefixes.some((prefix) => prefixPattern(prefix).test(decoded));
  if (!allowed) return err(`\`${host}${decoded}\` isn't a page browser steps may open`);
  return ok({ service: origin.service, kind: "page", name: `${host}${decoded}` });
}
