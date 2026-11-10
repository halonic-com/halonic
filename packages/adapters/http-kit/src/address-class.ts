import { type IpAddress, parseIpAddress } from "./ip-address.ts";

/**
 * Where an IP address leads, for deciding whether a request may connect to it.
 *
 * - `public`: the internet.
 * - `private`: a home or office network (`10/8`, `172.16/12`, `192.168/16`, `fc00::/7`).
 * - `loopback`: this computer (`127/8`, `::1`).
 * - `link-local`: the network segment, without a router (`169.254/16`, `fe80::/10`).
 * - `metadata`: a cloud machine's credential service, such as `169.254.169.254`.
 * - `unspecified`: `0.0.0.0/8` and `::`, which reach this computer on some systems.
 * - `reserved`: everything that is none of these and must never be connected
 *   to: carrier-grade NAT (`100.64/10`), documentation and benchmark ranges,
 *   multicast, broadcast, IPv4-mapped IPv6, and NAT64 or 6to4 forms of any
 *   address that isn't public.
 */
export type AddressClass =
  | "public"
  | "private"
  | "loopback"
  | "link-local"
  | "metadata"
  | "unspecified"
  | "reserved";

/**
 * The class of an IP address in canonical text, as a DNS answer or
 * `URL.hostname` gives it (see `parseIpAddress`).
 *
 * @throws RangeError when the text isn't an IP address, so a caller that
 *   checks a DNS answer never treats an odd answer as allowed.
 */
export function classifyAddress(address: string): AddressClass {
  const parsed = parseIpAddress(address);
  if (parsed === undefined) {
    throw new RangeError(`not an IP address: ${JSON.stringify(address)}`);
  }
  return classOf(parsed);
}

/** The class of a parsed address. */
function classOf(address: IpAddress): AddressClass {
  return address.version === 4 ? classOfIpv4(address.bytes) : classOfIpv6(address.bytes);
}

/** The class of host a permission sheet declares: the internet, the home network or this computer. */
export type HostClass = "public" | "private" | "loopback";

/**
 * Whether a host of the class a sheet declares may connect to an address: a
 * public host only to public addresses, a home-network host only to private
 * ones, and a host on this computer only to loopback. A name can resolve
 * anywhere, so this holds for every address in every answer.
 *
 * @throws RangeError when the text isn't an IP address.
 */
export function addressAllowedFor(host: HostClass, address: string): boolean {
  return classifyAddress(address) === host;
}

/** One block of addresses: the leading `bits` of `prefix`. */
interface Block {
  readonly prefix: readonly number[];
  readonly bits: number;
  readonly class: AddressClass;
}

const block = (prefix: readonly number[], bits: number, kind: AddressClass): Block => ({
  prefix,
  bits,
  class: kind,
});

// Metadata services, ahead of the wider blocks they sit in: AWS, GCP and
// Azure (169.254.169.254), AWS containers (169.254.170.2) and Alibaba
// (100.100.100.200).
const ipv4Blocks: readonly Block[] = [
  block([169, 254, 169, 254], 32, "metadata"),
  block([169, 254, 170, 2], 32, "metadata"),
  block([100, 100, 100, 200], 32, "metadata"),
  block([0], 8, "unspecified"),
  block([10], 8, "private"),
  block([100, 64], 10, "reserved"),
  block([127], 8, "loopback"),
  block([169, 254], 16, "link-local"),
  block([172, 16], 12, "private"),
  block([192, 0, 0], 24, "reserved"),
  block([192, 0, 2], 24, "reserved"),
  block([192, 88, 99], 24, "reserved"),
  block([192, 168], 16, "private"),
  block([198, 18], 15, "reserved"),
  block([198, 51, 100], 24, "reserved"),
  block([203, 0, 113], 24, "reserved"),
  block([224], 4, "reserved"),
  block([240], 4, "reserved"),
];

// AWS's IPv6 metadata address sits in the private block, so it comes first.
const ipv6Blocks: readonly Block[] = [
  block([0xfd, 0x00, 0x0e, 0xc2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x02, 0x54], 128, "metadata"),
  block(new Array<number>(16).fill(0), 128, "unspecified"),
  block([...new Array<number>(15).fill(0), 1], 128, "loopback"),
  block([0x01, 0x00, 0, 0, 0, 0, 0, 0], 64, "reserved"),
  block([0x20, 0x01, 0x0d, 0xb8], 32, "reserved"),
  block([0x20, 0x01, 0x00, 0x00], 32, "reserved"),
  block([0x3f, 0xff, 0x00], 20, "reserved"),
  block([0xfc], 7, "private"),
  block([0xfe, 0x80], 10, "link-local"),
  block([0x20], 3, "public"),
];

function classOfIpv4(bytes: readonly number[]): AddressClass {
  return ipv4Blocks.find((candidate) => inBlock(bytes, candidate))?.class ?? "public";
}

function classOfIpv6(bytes: readonly number[]): AddressClass {
  const embedded = embeddedIpv4(bytes);
  if (embedded !== undefined) {
    // A NAT64 or 6to4 address reaches the IPv4 address inside it. It may
    // stand in for a public one; for any other it would reach a network the
    // name's own class doesn't allow, so it's refused.
    return classOfIpv4(embedded) === "public" ? "public" : "reserved";
  }
  // Everything outside global unicast `2000::/3` and the blocks above,
  // including IPv4-mapped `::ffff:0:0/96`, is reserved.
  return ipv6Blocks.find((candidate) => inBlock(bytes, candidate))?.class ?? "reserved";
}

/**
 * The IPv4 address a NAT64 (`64:ff9b::/96`) or 6to4 (`2002::/16`) address
 * carries. Undefined for every other address. IPv4-mapped addresses
 * (`::ffff:0:0/96`) aren't read: a DNS answer never holds one, so one that
 * does is refused whatever it carries.
 */
function embeddedIpv4(bytes: readonly number[]): readonly number[] | undefined {
  if (inBlock(bytes, block([0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0], 96, "reserved"))) {
    return bytes.slice(12);
  }
  if (inBlock(bytes, block([0x20, 0x02], 16, "reserved"))) {
    return bytes.slice(2, 6);
  }
  return undefined;
}

function inBlock(bytes: readonly number[], candidate: Block): boolean {
  // Each prefix holds exactly the bytes its bits touch, so only the last may be partial.
  return candidate.prefix.every((prefixByte, index) => {
    const bitsLeft = candidate.bits - index * 8;
    const mask = bitsLeft >= 8 ? 0xff : (0xff << (8 - bitsLeft)) & 0xff;
    return ((bytes[index] ?? 0) & mask) === (prefixByte & mask);
  });
}
