// Whether text is an absolute URL, by the WHATWG URL standard that browsers,
// Node and Zod's url() use (https://url.spec.whatwg.org/#concept-basic-url-parser).
// The core may not use the platform's URL class (plan 4.1), so this follows
// the parser's steps that can fail. Everything else (paths, queries,
// fragments) never fails, so it isn't parsed. One known gap: hosts with
// non-ASCII letters skip the IDNA checks and are accepted.
import { endsInNumber, isIpv4, isIpv6 } from "./ip-address.ts";

const SPECIAL_SCHEMES = new Set(["http", "https", "ws", "wss", "ftp"]);

// Printable characters no host may contain (https://url.spec.whatwg.org/#forbidden-host-code-point).
// NUL, tab and line breaks are forbidden too; they are checked by code.
const FORBIDDEN_HOST_SYMBOLS = new Set([..." #/:<>?@[\\]^|"]);
// Domains also forbid every other control character, "%" and DEL.
const FORBIDDEN_DOMAIN_SYMBOLS = new Set([...FORBIDDEN_HOST_SYMBOLS, "%"]);

/** Whether `text` parses as an absolute URL. */
export function isUrl(text: string): boolean {
  // The parser ignores control characters and spaces at either end, and
  // tabs and line breaks anywhere.
  const cleaned = trimControlsAndSpaces(text).replace(/[\t\n\r]/g, "");
  const scheme = /^[A-Za-z][A-Za-z0-9+.-]*:/.exec(cleaned)?.[0];
  if (scheme === undefined) return false;
  const name = scheme.slice(0, -1).toLowerCase();
  const rest = cleaned.slice(scheme.length);
  if (name === "file") return isFileUrlRest(rest);
  if (SPECIAL_SCHEMES.has(name)) return isSpecialUrlRest(rest);
  return isOtherUrlRest(rest);
}

// http, https, ws, wss and ftp: any slashes or backslashes, then an
// authority with a host that may not be empty.
function isSpecialUrlRest(rest: string): boolean {
  const afterSlashes = rest.replace(/^[/\\]*/, "");
  const authority = takeUntil(afterSlashes, /[/\\?#]/);
  return isAuthority(authority, true);
}

// Any other scheme: an authority only after "//", where the host may be
// empty and is checked less strictly. Without "//" there is only a path.
function isOtherUrlRest(rest: string): boolean {
  if (!rest.startsWith("//")) return true;
  const authority = takeUntil(rest.slice(2), /[/?#]/);
  return isAuthority(authority, false);
}

// file: a host only after two slashes, with no user and no port. An empty
// host and a Windows drive letter ("file://C:/") are fine.
function isFileUrlRest(rest: string): boolean {
  if (!/^[/\\]{2}/.test(rest)) return true;
  const host = takeUntil(rest.slice(2), /[/\\?#]/);
  if (host === "" || /^[A-Za-z][:|]$/.test(host)) return true;
  return isSpecialHost(host);
}

// "user:password@host:port". Only the part after the last "@" is the host.
function isAuthority(authority: string, special: boolean): boolean {
  const atSign = authority.lastIndexOf("@");
  const hostAndPort = atSign === -1 ? authority : authority.slice(atSign + 1);
  if (atSign !== -1 && hostAndPort === "") return false;
  const colon = findPortColon(hostAndPort);
  const host = colon === -1 ? hostAndPort : hostAndPort.slice(0, colon);
  if (colon !== -1) {
    if (host === "" || !isPort(hostAndPort.slice(colon + 1))) return false;
  }
  if (host === "") return !special;
  return special ? isSpecialHost(host) : isOpaqueHost(host);
}

// The first ":" outside "[...]", which separates host and port.
function findPortColon(hostAndPort: string): number {
  let insideBrackets = false;
  for (let index = 0; index < hostAndPort.length; index++) {
    const character = hostAndPort[index];
    if (character === "[") insideBrackets = true;
    if (character === "]") insideBrackets = false;
    if (character === ":" && !insideBrackets) return index;
  }
  return -1;
}

function isPort(port: string): boolean {
  if (port === "") return true;
  return /^[0-9]+$/.test(port) && Number(port) <= 65535;
}

// Hosts of special schemes are domains or IP addresses, after percent-decoding.
function isSpecialHost(host: string): boolean {
  if (host.startsWith("[")) return isBracketedIpv6(host);
  const decoded = percentDecode(host);
  if (decoded === undefined) return isAsciiPartAllowed(host);
  const domain = decoded.toLowerCase();
  if (hasForbiddenDomainCharacter(domain)) return false;
  if (endsInNumber(domain)) return isIpv4(domain);
  return true;
}

// Hosts of other schemes are kept as written; only a few characters are refused.
function isOpaqueHost(host: string): boolean {
  if (host.startsWith("[")) return isBracketedIpv6(host);
  for (const character of host) {
    if (FORBIDDEN_HOST_SYMBOLS.has(character) || character === "\0") return false;
  }
  return true;
}

function isBracketedIpv6(host: string): boolean {
  if (!host.endsWith("]")) return false;
  return isIpv6(host.slice(1, -1));
}

// Decodes "%41" style escapes. Returns undefined when the host is not plain
// ASCII before or after decoding: those hosts take the lenient path.
function percentDecode(host: string): string | undefined {
  if (!isAscii(host)) return undefined;
  let decoded = "";
  for (let index = 0; index < host.length; index++) {
    const percentEscape = /^%[0-9a-fA-F]{2}/.exec(host.slice(index, index + 3))?.[0];
    if (percentEscape === undefined) {
      decoded += host[index];
      continue;
    }
    const byte = Number.parseInt(percentEscape.slice(1), 16);
    if (byte > 0x7f) return undefined;
    decoded += String.fromCharCode(byte);
    index += 2;
  }
  return decoded;
}

// The lenient path for non-ASCII hosts: only the ASCII characters are checked.
function isAsciiPartAllowed(host: string): boolean {
  let asciiOnly = "";
  for (const character of host.replace(/%[0-9a-fA-F]{2}/g, "")) {
    if (isAscii(character)) asciiOnly += character;
  }
  return !hasForbiddenDomainCharacter(asciiOnly);
}

function hasForbiddenDomainCharacter(domain: string): boolean {
  for (const character of domain) {
    if (FORBIDDEN_DOMAIN_SYMBOLS.has(character) || isControlCharacter(character)) return true;
  }
  return false;
}

// The parser ignores control characters and spaces (U+0000 to U+0020) at either end.
function trimControlsAndSpaces(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && text.charCodeAt(start) <= 0x20) start++;
  while (end > start && text.charCodeAt(end - 1) <= 0x20) end--;
  return text.slice(start, end);
}

// C0 controls (U+0000 to U+001F) and DEL.
function isControlCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code <= 0x1f || code === 0x7f;
}

function isAscii(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) > 0x7f) return false;
  }
  return true;
}

function takeUntil(text: string, stop: RegExp): string {
  const match = stop.exec(text);
  return match === null ? text : text.slice(0, match.index);
}
