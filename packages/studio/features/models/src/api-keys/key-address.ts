/**
 * The address typed into a key's Address field, read as the keychain will keep it: its scheme,
 * host and port (`new URL(…).origin`), or what is wrong with it. The shell makes the origin
 * itself when the address is saved; this reading only shows the person the same answer first.
 */
export type ReadAddress =
  | {
      readonly kind: "address";
      /** The address as it is kept, such as `https://gateway.example.com`. */
      readonly address: string;
      /** A path, query or fragment was typed, and is dropped. */
      readonly partDropped: boolean;
      /** `http` to an address that isn't this computer, so the key crosses the network in the clear. */
      readonly unencrypted: boolean;
    }
  | { readonly kind: "problem"; readonly problem: AddressProblem };

/** Why the typed text can't be kept: nothing typed, not an address, a user name or password in it, or a scheme other than `http` and `https`. */
export type AddressProblem = "empty" | "not-an-address" | "user-info" | "scheme";

/** Something that starts like an address of another scheme, such as `ftp://` or `file:`, not `localhost:11434`. */
const otherScheme = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Reads the typed text as an address. Not `URL.parse()`: Studio's oldest webviews don't have it
 * (the `webview-apis` check in docs/guides/checks.md).
 *
 * @example
 * readAddress(" https://Gateway.example.com:443/v1 ");
 * // { kind: "address", address: "https://gateway.example.com", partDropped: true, unencrypted: false }
 */
export function readAddress(text: string): ReadAddress {
  const typed = text.trim();
  if (typed === "") return { kind: "problem", problem: "empty" };
  const url = parsedUrl(typed);
  if (url === undefined) return { kind: "problem", problem: "not-an-address" };
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { kind: "problem", problem: otherScheme.test(typed) ? "scheme" : "not-an-address" };
  }
  if (url.username !== "" || url.password !== "") return { kind: "problem", problem: "user-info" };
  return {
    kind: "address",
    address: url.origin,
    partDropped: url.pathname !== "/" || url.search !== "" || url.hash !== "",
    unencrypted: url.protocol === "http:" && !isLoopback(url.hostname),
  };
}

function parsedUrl(text: string): URL | undefined {
  try {
    return new URL(text);
  } catch {
    return undefined;
  }
}

/** `localhost`, a name under it, `127.x.x.x` or `[::1]`: this computer, so `http` stays on it. */
function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    /^127\.\d+\.\d+\.\d+$/.test(hostname) ||
    hostname === "[::1]"
  );
}
