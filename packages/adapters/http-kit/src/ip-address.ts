/**
 * An IP address as its bytes: 4 for IPv4, 16 for IPv6. Byte arrays let the
 * classes in `address-class.ts` be plain prefix tables, with no string
 * matching that a second spelling of the same address could slip past.
 */
export interface IpAddress {
  readonly version: 4 | 6;
  readonly bytes: readonly number[];
}

/**
 * Reads an IP address in the canonical text a DNS answer or `URL.hostname`
 * gives: dotted IPv4 (`127.0.0.1`) or IPv6, with or without the brackets
 * `URL` puts around it (`[::1]`), with an optional dotted IPv4 tail
 * (`::ffff:127.0.0.1`).
 *
 * Anything else is not an address here, so the answer is undefined: the
 * loose IPv4 forms (decimal `2130706433`, octal `0177.0.0.1`, hex
 * `0x7f000001`, short `127.1`), leading zeros, and IPv6 zone IDs (`fe80::1%eth0`).
 * `URL` already turns the loose forms into dotted IPv4, so a caller that
 * reads hosts through `URL` never sees them; one that doesn't must not guess
 * what they mean.
 */
export function parseIpAddress(text: string): IpAddress | undefined {
  const v4 = parseIpv4(text);
  if (v4 !== undefined) {
    return { version: 4, bytes: v4 };
  }
  const unbracketed = text.startsWith("[") && text.endsWith("]") ? text.slice(1, -1) : text;
  const v6 = parseIpv6(unbracketed);
  return v6 === undefined ? undefined : { version: 6, bytes: v6 };
}

const decimalByte = /^(0|[1-9]\d{0,2})$/;

function parseIpv4(text: string): number[] | undefined {
  const parts = text.split(".");
  if (parts.length !== 4) {
    return undefined;
  }
  const bytes: number[] = [];
  for (const part of parts) {
    if (!decimalByte.test(part) || Number(part) > 255) {
      return undefined;
    }
    bytes.push(Number(part));
  }
  return bytes;
}

const hexGroup = /^[0-9a-fA-F]{1,4}$/;

function parseIpv6(text: string): number[] | undefined {
  const [before = "", after, ...more] = text.split("::");
  if (more.length > 0) {
    return undefined;
  }
  if (after === undefined) {
    // No `::`: the text holds all eight groups.
    const whole = parseGroups(before, true);
    return whole?.length === 16 ? whole : undefined;
  }
  const head = parseGroups(before, false);
  const tail = parseGroups(after, true);
  if (head === undefined || tail === undefined) {
    return undefined;
  }
  const missing = 16 - head.length - tail.length;
  // `::` stands for at least one group of zeros.
  if (missing < 2) {
    return undefined;
  }
  return [...head, ...new Array<number>(missing).fill(0), ...tail];
}

/**
 * The bytes of colon-separated groups, such as `2001:db8` or `ffff:1.2.3.4`.
 * An empty text is no groups. Only the last group may be dotted IPv4, and
 * only where `mayEndInIpv4` says the text ends the address.
 */
function parseGroups(text: string, mayEndInIpv4: boolean): number[] | undefined {
  if (text === "") {
    return [];
  }
  const groups = text.split(":");
  const bytes: number[] = [];
  for (const [index, group] of groups.entries()) {
    const last = index === groups.length - 1;
    if (last && mayEndInIpv4 && group.includes(".")) {
      const v4 = parseIpv4(group);
      if (v4 === undefined) {
        return undefined;
      }
      bytes.push(...v4);
      continue;
    }
    if (!hexGroup.test(group)) {
      return undefined;
    }
    const value = Number.parseInt(group, 16);
    bytes.push(value >> 8, value & 0xff);
  }
  return bytes;
}
