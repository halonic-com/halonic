import { type AddressClass, classifyAddress, type HostClass } from "./address-class.ts";

/**
 * Where an `http` connector's or an integration's address may lead: an
 * address written as numbers to its own class, `localhost` to this computer,
 * and any other name to the internet only. The address as written is what the
 * person saw when they trusted the workspace; a name that resolves to a
 * home-network address is refused, so a DNS answer can't move a request onto
 * the person's own network.
 *
 * @example
 * connectorHostClass(new URL("http://localhost:8080/mcp")); // "loopback"
 * connectorHostClass(new URL("https://notes.acme.test/mcp")); // "public"
 */
export function connectorHostClass(url: URL): HostClass | undefined {
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost") return "loopback";
  const written = addressClassOf(host);
  if (written === undefined) return "public";
  return written === "public" || written === "private" || written === "loopback"
    ? written
    : undefined;
}

/** The class of `host` when it is an IP address, or `undefined` for a name. */
function addressClassOf(host: string): AddressClass | undefined {
  try {
    return classifyAddress(host);
  } catch {
    // Not an address but a name: the caller decides.
    return undefined;
  }
}
