/** Hosts that may be reached over plain `http`: this computer only. */
const loopbackHosts: readonly string[] = ["localhost", "127.0.0.1", "[::1]"];

/** Whether `hostname` (as a `URL` gives it) is this computer, the only host plain `http` or `ws` may reach. */
export function isLoopbackHost(hostname: string): boolean {
  return loopbackHosts.includes(hostname);
}

/** Thrown when a connection's address isn't one the client may send a key to. */
export class UnsafeAddressError extends Error {
  constructor(reason: string) {
    super(`The Paperclip address can't be used: ${reason}`);
    this.name = "UnsafeAddressError";
  }
}

/**
 * The origin (scheme, host and port) the client sends every request to.
 * The address must be `https`, or plain `http` to `localhost`, `127.0.0.1`
 * or `::1`, so a key never crosses a network in the clear. It may not carry
 * a user name, a password, a path, a query or a fragment, so nothing but the
 * origin decides where a request goes.
 */
export function checkedOrigin(address: string): string {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new UnsafeAddressError("it isn't a web address.");
  }
  if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
    throw new UnsafeAddressError("plain http is allowed only to this computer; use https.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeAddressError("use https.");
  }
  if (url.username !== "" || url.password !== "") {
    throw new UnsafeAddressError("it holds a user name or password.");
  }
  if ((url.pathname !== "/" && url.pathname !== "") || url.search !== "" || url.hash !== "") {
    throw new UnsafeAddressError("give only the scheme, host and port.");
  }
  return url.origin;
}
