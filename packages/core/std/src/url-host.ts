import { asciiHost } from "./ascii-host.ts";

/** The host of a URL, as a name or an address. */
export type UrlHost =
  | { readonly kind: "domain"; readonly name: string }
  /** Four numbers from 0 to 255. */
  | { readonly kind: "ipv4"; readonly octets: readonly number[] }
  /** Eight numbers from 0 to 65535, the groups of the address in order. */
  | { readonly kind: "ipv6"; readonly groups: readonly number[] };

const urlShape = /^(https?):\/\/([^/?#\\]*)/i;
const maxPort = 65535;
const forbiddenInDomain = /[\s#%/:<>?@[\\\]^|]/;

/**
 * Reads the host of an `http` or `https` URL the way a browser would, for
 * the cases that decide where a request goes: user info before an `@`, a
 * port, a trailing dot, an IPv4 address written as `127.1`, `2130706433` or
 * `0x7f.0.0.1`, and an IPv6 address in brackets. The core has no `URL`
 * class, so it is read by hand.
 *
 * It does not give the full IDNA mapping, so a host with any non-ASCII
 * character, a percent-encoded host, other schemes and anything it doesn't
 * fully understand give `undefined`.
 * Callers that need a safe answer treat that as "unknown".
 *
 * @param url - the URL as written
 * @returns the host, or `undefined` when it is not an `http(s)` URL with a host this reader understands
 *
 * @example
 * urlHost("http://127.1:8080"); // { kind: "ipv4", octets: [127, 0, 0, 1] }
 * urlHost("http://localhost@evil.example"); // { kind: "domain", name: "evil.example" }
 */
export function urlHost(url: string): UrlHost | undefined {
  const match = urlShape.exec(trimEdges(url));
  if (match === null) {
    return undefined;
  }
  const authority = (match[2] ?? "").slice((match[2] ?? "").lastIndexOf("@") + 1);
  if (authority.startsWith("[")) {
    return ipv6Host(authority);
  }
  const colon = authority.indexOf(":");
  const text = colon === -1 ? authority : authority.slice(0, colon);
  if (colon !== -1 && !isPort(authority.slice(colon + 1))) {
    return undefined;
  }
  return nameOrIpv4(text);
}

/** A port is digits only, or empty, and fits in 16 bits. */
function isPort(text: string): boolean {
  return /^\d*$/.test(text) && (text === "" || Number(text) <= maxPort);
}

function ipv6Host(authority: string): UrlHost | undefined {
  const end = authority.indexOf("]");
  const after = authority.slice(end + 1);
  if (end === -1 || !(after === "" || (after.startsWith(":") && isPort(after.slice(1))))) {
    return undefined;
  }
  const groups = parseIpv6(authority.slice(1, end));
  return groups === undefined ? undefined : { kind: "ipv6", groups };
}

function nameOrIpv4(text: string): UrlHost | undefined {
  // Non-ASCII hosts would need the full IDNA mapping, so a wrong guess is worse than none.
  if (
    text === "" ||
    hasNonAscii(text) ||
    forbiddenInDomain.test(text) ||
    hasControlCharacter(text)
  ) {
    return undefined;
  }
  const name = asciiHost(text.endsWith(".") ? text.slice(0, -1) : text);
  const labels = name.split(".");
  if (labels.some((label) => label === "")) {
    return undefined;
  }
  if (!endsInNumber(labels)) {
    return { kind: "domain", name };
  }
  const octets = parseIpv4(labels);
  return octets === undefined ? undefined : { kind: "ipv4", octets };
}

/** A host whose last label is a number is an IPv4 address or nothing (WHATWG "ends in a number"). */
function endsInNumber(labels: readonly string[]): boolean {
  const last = labels[labels.length - 1] ?? "";
  return /^(\d+|0x[0-9a-f]*)$/.test(last);
}

function parseIpv4(labels: readonly string[]): number[] | undefined {
  if (labels.length > 4) {
    return undefined;
  }
  const numbers = labels.map(ipv4Number);
  if (numbers.some((number) => number === undefined)) {
    return undefined;
  }
  const values = numbers as number[];
  const last = values[values.length - 1] as number;
  const head = values.slice(0, -1);
  if (head.some((value) => value > 255) || last >= 256 ** (5 - values.length)) {
    return undefined;
  }
  let address = last;
  head.forEach((value, index) => {
    address += value * 256 ** (3 - index);
  });
  return [24, 16, 8, 0].map((shift) => Math.floor(address / 2 ** shift) % 256);
}

function ipv4Number(label: string): number | undefined {
  if (/^0x[0-9a-f]*$/.test(label)) {
    return label.length === 2 ? 0 : Number.parseInt(label.slice(2), 16);
  }
  if (/^0[0-7]+$/.test(label)) {
    return Number.parseInt(label, 8);
  }
  // A leading 0 means octal, so `09` is not a number.
  return /^(0|[1-9]\d*)$/.test(label) ? Number.parseInt(label, 10) : undefined;
}

function parseIpv6(text: string): number[] | undefined {
  const sides = text.split("::");
  if (sides.length > 2) {
    return undefined;
  }
  const head = groupsOf(sides[0] ?? "", sides.length === 1);
  const tail = sides.length === 2 ? groupsOf(sides[1] ?? "", true) : [];
  if (head === undefined || tail === undefined) {
    return undefined;
  }
  if (sides.length === 1) {
    return head.length === 8 ? head : undefined;
  }
  const missing = 8 - head.length - tail.length;
  return missing < 1 ? undefined : [...head, ...new Array<number>(missing).fill(0), ...tail];
}

/** The groups of one side of an IPv6 address; the end of the address may be an IPv4 address that makes two. */
function groupsOf(side: string, endsAddress: boolean): number[] | undefined {
  if (side === "") {
    return [];
  }
  const parts = side.split(":");
  const groups: number[] = [];
  for (const [index, part] of parts.entries()) {
    if (index === parts.length - 1 && part.includes(".")) {
      const octets = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
        .exec(part)
        ?.slice(1)
        .map(Number);
      if (!endsAddress || octets === undefined || octets.some((octet) => octet > 255)) {
        return undefined;
      }
      groups.push(
        (octets[0] as number) * 256 + (octets[1] as number),
        (octets[2] as number) * 256 + (octets[3] as number),
      );
    } else if (/^[0-9a-f]{1,4}$/i.test(part)) {
      groups.push(Number.parseInt(part, 16));
    } else {
      return undefined;
    }
  }
  return groups;
}

function hasControlCharacter(text: string): boolean {
  return [...text].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f;
  });
}

/** What the URL rules strip from both ends: control characters and the space, not Unicode spaces. */
function trimEdges(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && text.charCodeAt(start) <= 0x20) {
    start += 1;
  }
  while (end > start && text.charCodeAt(end - 1) <= 0x20) {
    end -= 1;
  }
  return text.slice(start, end);
}

function hasNonAscii(text: string): boolean {
  return [...text].some((character) => (character.codePointAt(0) ?? 0) > 0x7f);
}
