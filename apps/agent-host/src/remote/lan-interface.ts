/** The one network interface the pairing advertisement uses: the one the phone shares. */
export interface LanInterface {
  /** The computer's IPv4 address on it, such as "192.168.1.20". */
  readonly address: string;
  /** Its IPv4 netmask, such as "255.255.255.0". */
  readonly netmask: string;
}

/** A subnet as two 32-bit numbers, so an address is checked with one mask. */
export interface Subnet {
  readonly network: number;
  readonly mask: number;
}

/** The address as a 32-bit number, or `undefined` when it isn't IPv4 in dotted form. */
function ipv4Number(address: string): number | undefined {
  const parts = address.split(".");
  if (parts.length !== 4) return undefined;
  let value = 0;
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255) return undefined;
    value = value * 256 + Number(part);
  }
  return value;
}

/**
 * The subnet of a LAN interface.
 *
 * @throws RangeError when the address isn't IPv4, or the netmask isn't one
 *   run of ones from the top followed by zeros, or is all zeros (that would
 *   count every address as local)
 */
export function subnetOf(lan: LanInterface): Subnet {
  const address = ipv4Number(lan.address);
  if (address === undefined) throw new RangeError(`not an IPv4 address: ${lan.address}`);
  const mask = ipv4Number(lan.netmask);
  // A mask of ones then zeros: its inverse plus one is a power of two.
  const inverse = mask === undefined ? 1 : ~mask >>> 0;
  if (mask === undefined || mask === 0 || (inverse & (inverse + 1)) !== 0) {
    throw new RangeError(`not an IPv4 netmask: ${lan.netmask}`);
  }
  return { network: (address & mask) >>> 0, mask };
}

/** Whether `address` is an IPv4 address on `subnet`; anything else isn't. */
export function onSubnet(subnet: Subnet, address: string): boolean {
  const value = ipv4Number(address);
  return value !== undefined && (value & subnet.mask) >>> 0 === subnet.network;
}
