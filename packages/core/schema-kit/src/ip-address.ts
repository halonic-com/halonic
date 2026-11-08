// The IP address rules of the WHATWG URL standard, reduced to "valid or
// not": https://url.spec.whatwg.org/#concept-ipv4-parser and #concept-ipv6-parser.

/**
 * Whether a host's last dot-separated part is a number, which makes the
 * whole host an IPv4 address that must then be valid ("1.2.3.4", "0x7f.1").
 */
export function endsInNumber(host: string): boolean {
  const parts = host.split(".");
  if (parts.at(-1) === "") {
    if (parts.length === 1) return false;
    parts.pop();
  }
  const last = parts.at(-1) ?? "";
  if (last !== "" && /^[0-9]+$/.test(last)) return true;
  return parseIpv4Number(last) !== undefined;
}

/** Whether `host` is a valid IPv4 address in any form the URL standard allows (decimal, hex, octal, 1–4 parts). */
export function isIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.at(-1) === "" && parts.length > 1) parts.pop();
  if (parts.length > 4) return false;
  const numbers: number[] = [];
  for (const part of parts) {
    const number = parseIpv4Number(part);
    if (number === undefined) return false;
    numbers.push(number);
  }
  for (let index = 0; index < numbers.length - 1; index++) {
    if ((numbers[index] ?? 0) > 255) return false;
  }
  const last = numbers.at(-1) ?? 0;
  return last < 256 ** (5 - numbers.length);
}

// One part: "0x" starts hex, a leading "0" starts octal, decimal otherwise.
function parseIpv4Number(part: string): number | undefined {
  if (part === "") return undefined;
  let digits = part;
  let radix = 10;
  if (digits.startsWith("0x") || digits.startsWith("0X")) {
    digits = digits.slice(2);
    radix = 16;
  } else if (digits.length > 1 && digits.startsWith("0")) {
    digits = digits.slice(1);
    radix = 8;
  }
  if (digits === "") return 0;
  if (!DIGITS_BY_RADIX[radix]?.test(digits)) return undefined;
  return Number.parseInt(digits, radix);
}

const DIGITS_BY_RADIX: Record<number, RegExp> = {
  8: /^[0-7]+$/,
  10: /^[0-9]+$/,
  16: /^[0-9a-fA-F]+$/,
};

/** Whether `text` (without the brackets) is a valid IPv6 address, such as "::1" or "::ffff:1.2.3.4". */
export function isIpv6(text: string): boolean {
  const reader = new Ipv6Reader(text);
  let pieceIndex = 0;
  let compressed = false;
  if (reader.current === ":") {
    if (reader.peek(1) !== ":") return false;
    reader.advance(2);
    pieceIndex++;
    compressed = true;
  }
  while (!reader.atEnd) {
    if (pieceIndex === 8) return false;
    if (reader.current === ":") {
      // "::" stands for one or more zero pieces, and may appear only once.
      if (compressed) return false;
      reader.advance(1);
      pieceIndex++;
      compressed = true;
      continue;
    }
    const piece = readPiece(reader, pieceIndex);
    if (piece === "invalid") return false;
    if (piece === "ipv4") {
      pieceIndex += 2;
      break;
    }
    pieceIndex++;
  }
  return compressed || pieceIndex === 8;
}

// One piece: up to four hex digits and the ":" after it, or the IPv4 tail,
// which fills two pieces.
function readPiece(reader: Ipv6Reader, pieceIndex: number): "hex" | "ipv4" | "invalid" {
  let length = 0;
  while (length < 4 && isHexDigit(reader.current)) {
    reader.advance(1);
    length++;
  }
  if (reader.current === ".") {
    if (length === 0 || pieceIndex > 6) return "invalid";
    reader.advance(-length);
    return readEmbeddedIpv4(reader) ? "ipv4" : "invalid";
  }
  if (reader.current === ":") {
    reader.advance(1);
    return reader.atEnd ? "invalid" : "hex";
  }
  return reader.atEnd ? "hex" : "invalid";
}

// The dotted IPv4 tail of an IPv6 address: exactly four decimal parts, no leading zeros.
function readEmbeddedIpv4(reader: Ipv6Reader): boolean {
  let numbersSeen = 0;
  while (!reader.atEnd) {
    if (numbersSeen > 0) {
      if (reader.current !== "." || numbersSeen >= 4) return false;
      reader.advance(1);
    }
    if (!isDecimalDigit(reader.current)) return false;
    let value: number | undefined;
    while (isDecimalDigit(reader.current)) {
      const digit = Number(reader.current);
      if (value === 0) return false;
      value = value === undefined ? digit : value * 10 + digit;
      if (value > 255) return false;
      reader.advance(1);
    }
    numbersSeen++;
  }
  return numbersSeen === 4;
}

class Ipv6Reader {
  readonly #text: string;
  #position = 0;

  constructor(text: string) {
    this.#text = text;
  }

  get atEnd(): boolean {
    return this.#position >= this.#text.length;
  }

  get current(): string | undefined {
    return this.#text[this.#position];
  }

  peek(offset: number): string | undefined {
    return this.#text[this.#position + offset];
  }

  advance(count: number): void {
    this.#position += count;
  }
}

function isHexDigit(character: string | undefined): boolean {
  return character !== undefined && /^[0-9a-fA-F]$/.test(character);
}

function isDecimalDigit(character: string | undefined): boolean {
  return character !== undefined && /^[0-9]$/.test(character);
}
