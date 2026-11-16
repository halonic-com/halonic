/** Where a person's browser is, for Google's sign-in: on the computer that runs Halonic, or on another. */
export type SignInPlace = "here" | "elsewhere";

/** The addresses a socket on this computer's own loopback shows. */
const loopbackAddresses: ReadonlySet<string> = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** The names a browser on this computer uses for it. */
const loopbackNames: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The host name of an `Origin` (`http://localhost:4747`) or a `Host` (`localhost:4747`) value, lowercased. Anything else, such as `null`, has none. */
function nameOf(origin: string): string | null {
  const parsed =
    /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?<name>[a-z0-9.-]+|\[[0-9a-f:]+\])(?::\d{1,5})?\/?$/.exec(
      origin.toLowerCase(),
    );
  return parsed?.groups?.["name"] ?? null;
}

/**
 * Whether Google's sign-in can open in this browser: `here` only when **both** the socket's address
 * and the page's own address are loopback. A tunnel or reverse proxy reaches the server from
 * loopback, so the address alone is not enough; through one the `Origin` (or the `Host`, when the
 * browser sent no `Origin`) is the proxy's public name. Anything else, also a missing value, is
 * `elsewhere`, which is the safe side: the command works from any terminal on the host, while
 * the button would fail in a browser on another computer.
 *
 * @param remoteAddress the socket's address, as the host vouches for it; never from a header
 * @param origin the `Origin` header, or the `Host` header when there is no `Origin`
 */
export function signInPlace(
  remoteAddress: string | undefined,
  origin: string | null | undefined,
): SignInPlace {
  if (remoteAddress === undefined || !loopbackAddresses.has(remoteAddress.toLowerCase())) {
    return "elsewhere";
  }
  const name = origin === null || origin === undefined ? null : nameOf(origin);
  return name !== null && loopbackNames.has(name) ? "here" : "elsewhere";
}

/** {@link signInPlace} for a request: the host's socket address, and the `Origin` or else the `Host`. */
export function signInPlaceOf(
  request: Request,
  context: { readonly clientAddress?: string },
): SignInPlace {
  return signInPlace(
    context.clientAddress,
    request.headers.get("origin") ?? request.headers.get("host"),
  );
}
