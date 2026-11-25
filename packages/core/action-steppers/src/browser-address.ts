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

/**
 * Anything but printable ASCII. Browsers drop tabs and line breaks from an
 * address, so `.<TAB>.` would open as `..` after the checks passed.
 */
const unprintable = /[^\x21-\x7e]/;

/**
 * Characters that open or close Markdown link, image or code syntax, or an
 * HTML tag. The manual guide prints the address as is into a Markdown card,
 * so an address holding one could show a link or load an image there.
 */
const markup = /[[\]()!<>`]/;

function hasPathTrick(decoded: string): boolean {
  // The browser removes `.` and `..` segments, which would step outside the prefix.
  const dotSegment = decoded.split("/").some((segment) => segment === "." || segment === "..");
  return (
    dotSegment ||
    unprintable.test(decoded) ||
    decoded.includes("..") ||
    decoded.includes("//") ||
    decoded.includes("\\") ||
    // `%3F` and `%23` decode to `?` and `#`, so the preview would show a query or fragment.
    decoded.includes("?") ||
    decoded.includes("#") ||
    /%2f/i.test(decoded)
  );
}

/**
 * Checks a `browser` block's address against the catalog's web origins and
 * their path prefixes (architecture note on HAL-17491, 7.1): `https` only, no
 * user name, password or port, only printable characters, none of
 * `[ ] ( ) ! < >` or a backtick (also once decoded), a host on the allow-list,
 * no query or fragment, and a path that, decoded once, holds no `.` or `..`
 * segment, `..`, `//`, `\`, `?`, `#`, `%2F` or unprintable character and
 * starts with one of the origin's prefixes. Returns the page it touches, or why not.
 *
 * @example
 * checkBrowserAddress("https://github.com/acme/app/settings/variables/actions", origins);
 * // ok({ service: "github", kind: "page", name: "github.com/acme/app/settings/variables/actions" })
 */
export function checkBrowserAddress(
  address: string,
  origins: readonly BrowserOrigin[],
): Result<StepperTarget, string> {
  if (unprintable.test(address)) {
    return err("the address holds a space, tab, line break or other unprintable character");
  }
  // Checked before any reason quotes the address, so a backtick can't close that quote either.
  if (markup.test(address)) {
    return err(
      "the address holds one of [ ] ( ) ! < > or a backtick, which a web page address never needs",
    );
  }
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
  // The decoded path becomes the target's name, which the preview and the card show.
  if (markup.test(decoded)) return err(`\`${address}\` encodes one of [ ] ( ) ! < > or a backtick`);
  const allowed = origin.pathPrefixes.some((prefix) => prefixPattern(prefix).test(decoded));
  if (!allowed) return err(`\`${host}${decoded}\` isn't a page browser steps may open`);
  return ok({ service: origin.service, kind: "page", name: `${host}${decoded}` });
}
