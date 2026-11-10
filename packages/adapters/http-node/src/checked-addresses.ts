import type { LookupFunction } from "node:net";
import { addressAllowedFor, type HostClass, parseIpAddress } from "@halonicjs/adapter-http-kit";
import { AddressRefusedError } from "./address-refused.ts";

/** Looks up every address of a host name, as `dns.lookup` with `all: true` does. */
export type Resolve = (hostname: string) => Promise<readonly string[]>;

/** Where one request goes, and the class its host is in. */
export interface Target {
  /** The host name or IP address, without the brackets `URL` puts around IPv6. */
  readonly hostname: string;
  readonly port: number;
  readonly hostClass: HostClass;
}

/**
 * The addresses a request to the target may connect to. It resolves the name
 * once and checks **every** address of the answer, so an answer that mixes
 * public and private addresses keeps only those in the host's class (A28).
 * An IP literal is checked as it is, with no lookup. A host on this computer
 * may never reach one of Halonic's own ports (A10).
 *
 * @throws AddressRefusedError when no address is left, before any connection
 */
export async function checkedAddresses(
  target: Target,
  resolve: Resolve,
  ownPorts: ReadonlySet<number>,
): Promise<string[]> {
  if (target.hostClass === "loopback" && ownPorts.has(target.port)) {
    throw new AddressRefusedError(
      `${target.hostname}:${target.port} is one of Halonic's own ports on this computer`,
    );
  }
  const literal = parseIpAddress(target.hostname) !== undefined;
  const answer = literal ? [target.hostname] : await resolve(target.hostname);
  const allowed = answer.filter((address) => isAllowed(target.hostClass, address));
  if (allowed.length === 0) {
    throw new AddressRefusedError(
      `${target.hostname} has no address a ${target.hostClass} host may reach`,
    );
  }
  return allowed;
}

/**
 * A `lookup` for `node:http` that hands out only the addresses already
 * checked, so the connection goes to a checked address and a second DNS
 * answer can't change it (A8). Node's happy-eyeballs asks for all of them.
 */
export function fixedLookup(addresses: readonly string[]): LookupFunction {
  const entries = addresses.map((address) => ({
    address,
    family: address.includes(":") ? 6 : 4,
  }));
  return (_hostname, options, callback) => {
    if (options.all === true) {
      callback(null, entries);
      return;
    }
    const [first] = entries;
    if (first === undefined) {
      callback(new AddressRefusedError("no checked address"), "", 4);
      return;
    }
    callback(null, first.address, first.family);
  };
}

// An answer that isn't canonical IP text, such as a link-local address with
// a zone ID, is refused rather than guessed at.
function isAllowed(hostClass: HostClass, address: string): boolean {
  return parseIpAddress(address) !== undefined && addressAllowedFor(hostClass, address);
}
