/**
 * The few parts of the DNS message format (RFC 1035) that multicast DNS
 * advertising needs (RFC 6762): reading the questions of a query, and
 * writing a response with its records. Nothing else of DNS is here.
 */

/** The record types the pairing advertisement uses. */
export const dnsTypes = { A: 1, PTR: 12, TXT: 16, SRV: 33, ANY: 255 } as const;

/** One of {@link dnsTypes}' names. */
export type DnsTypeName = keyof typeof dnsTypes;

/** The class of every record here, IN. */
const internetClass = 1;
/** The bit of a record's class that tells caches to drop older records of its name and type. */
const cacheFlushBit = 0x8000;
/** The flags of a multicast DNS response: a response, and authoritative. */
const responseFlags = 0x8400;
/** The bit of the flags that marks a message as a response. */
const responseBit = 0x8000;
const headerBytes = 12;

/*
 * The limits a query from the network must keep, or the host drops it
 * whole. The socket reads whatever anyone on the network sends, so the
 * reader trusts no count or length in it.
 */
/** The largest multicast DNS message (RFC 6762 section 17). */
export const dnsMaxMessageBytes = 9000;
/** The most questions read from one query; a phone's has one or two. */
export const dnsMaxQuestions = 16;
/** The longest name, counted as on the wire (RFC 1035 section 2.3.4). */
const maxNameBytes = 255;
/** The most compression pointers one name may follow. */
const maxPointers = 16;
/** The flags' opcode bits; a standard query has 0. */
const opcodeBits = 0x7800;
/** The bit of a question's class that asks for a unicast answer (RFC 6762 section 5.4). */
const unicastResponseBit = 0x8000;

/** One question of a query: a name and a type, as a number. */
export interface DnsQuestion {
  /** The name, lower case, without a trailing dot, such as `_halonic-pair._tcp.local`. */
  readonly name: string;
  readonly type: number;
}

/** One record of a response. */
export type DnsRecord = {
  readonly name: string;
  /** Seconds a cache keeps it; 0 says goodbye. */
  readonly ttl: number;
  /** Whether a cache drops older records of its name and type: for records only this host gives. */
  readonly unique: boolean;
} & (
  | { readonly type: "PTR"; readonly target: string }
  | { readonly type: "SRV"; readonly port: number; readonly target: string }
  | { readonly type: "TXT"; readonly entries: readonly string[] }
  | { readonly type: "A"; readonly address: string }
);

/**
 * The questions of a multicast DNS query. Anything else gives none: a
 * response, another opcode, a message over {@link dnsMaxMessageBytes}, more
 * than {@link dnsMaxQuestions} questions, a question of another class, or a
 * name that runs past the end, is too long, or follows a pointer that
 * doesn't point back. The network can send anything, so the host answers
 * only what it reads in full, and drops the rest without a word.
 */
export function readQuestions(message: Uint8Array): DnsQuestion[] {
  if (message.length < headerBytes || message.length > dnsMaxMessageBytes) return [];
  const view = new DataView(message.buffer, message.byteOffset, message.byteLength);
  const flags = view.getUint16(2);
  if ((flags & responseBit) !== 0 || (flags & opcodeBits) !== 0) return [];
  const count = view.getUint16(4);
  if (count > dnsMaxQuestions) return [];
  const questions: DnsQuestion[] = [];
  let offset = headerBytes;
  for (let index = 0; index < count; index += 1) {
    const name = readName(message, offset);
    if (name === undefined || name.end + 4 > message.length) return [];
    const questionClass = view.getUint16(name.end + 2) & ~unicastResponseBit;
    if (questionClass !== internetClass) return [];
    questions.push({ name: name.text.toLowerCase(), type: view.getUint16(name.end) });
    offset = name.end + 4;
  }
  return questions;
}

/**
 * A name at `offset`, following compression pointers, and where the name
 * ends in the message; `undefined` for a name that isn't whole. Each
 * pointer must point further back than the name's start or the pointer
 * before it, so pointers can't loop, and at most {@link maxPointers} are
 * followed. A name over
 * {@link maxNameBytes} or a label that isn't UTF-8 isn't read.
 */
function readName(message: Uint8Array, offset: number): { text: string; end: number } | undefined {
  const labels: string[] = [];
  let at = offset;
  let end: number | undefined;
  let limit = offset;
  let pointers = 0;
  let nameBytes = 1;
  while (at < message.length) {
    const length = message[at] as number;
    if (length === 0) return { text: labels.join("."), end: end ?? at + 1 };
    if ((length & 0xc0) === 0xc0) {
      const pointer = readPointer(message, at, limit, pointers);
      if (pointer === undefined) return undefined;
      pointers += 1;
      end ??= at + 2;
      limit = pointer;
      at = pointer;
      continue;
    }
    nameBytes += 1 + length;
    const label = nameBytes > maxNameBytes ? undefined : readLabel(message, at);
    if (label === undefined) return undefined;
    labels.push(label);
    at += 1 + length;
  }
  return undefined;
}

/** Where the pointer at `at` points, or `undefined` unless it is whole, before `limit` and within the count. */
function readPointer(
  message: Uint8Array,
  at: number,
  limit: number,
  followed: number,
): number | undefined {
  if (at + 1 >= message.length || followed === maxPointers) return undefined;
  const pointer = (((message[at] as number) & 0x3f) << 8) | (message[at + 1] as number);
  return pointer < limit ? pointer : undefined;
}

/**
 * The text of the label at `at`, or `undefined` when it is over 63 bytes,
 * runs past the end, isn't UTF-8 or holds a `.`: names are compared as
 * joined text, so a label `a.b` must not pass for the two labels `a` and `b`.
 */
function readLabel(message: Uint8Array, at: number): string | undefined {
  const length = message[at] as number;
  if (length > 63 || at + 1 + length > message.length) return undefined;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      message.subarray(at + 1, at + 1 + length),
    );
  } catch {
    return undefined;
  }
  return text.includes(".") ? undefined : text;
}

/**
 * A multicast DNS response holding `answers`, then `additionals`, with id 0
 * and no questions, as RFC 6762 section 18 asks. Names are written whole,
 * without compression.
 *
 * @throws RangeError for a label over 63 bytes, a TXT entry over 255 bytes or an address that isn't IPv4
 */
export function writeResponse(
  answers: readonly DnsRecord[],
  additionals: readonly DnsRecord[] = [],
): Uint8Array {
  const header = new Uint8Array(headerBytes);
  const view = new DataView(header.buffer);
  view.setUint16(2, responseFlags);
  view.setUint16(6, answers.length);
  view.setUint16(10, additionals.length);
  return concat([header, ...answers.map(writeRecord), ...additionals.map(writeRecord)]);
}

function writeRecord(record: DnsRecord): Uint8Array {
  const data = recordData(record);
  const fixed = new Uint8Array(10);
  const view = new DataView(fixed.buffer);
  view.setUint16(0, dnsTypes[record.type]);
  view.setUint16(2, internetClass | (record.unique ? cacheFlushBit : 0));
  view.setUint32(4, record.ttl);
  view.setUint16(8, data.length);
  return concat([writeName(record.name), fixed, data]);
}

function recordData(record: DnsRecord): Uint8Array {
  switch (record.type) {
    case "PTR":
      return writeName(record.target);
    case "SRV": {
      const fixed = new Uint8Array(6);
      new DataView(fixed.buffer).setUint16(4, record.port);
      return concat([fixed, writeName(record.target)]);
    }
    case "TXT":
      return concat(record.entries.map((entry) => withLength(utf8(entry), 255, "TXT entry")));
    case "A":
      return ipv4Bytes(record.address);
  }
}

function writeName(name: string): Uint8Array {
  const labels = name.split(".").map((label) => withLength(utf8(label), 63, "DNS label"));
  return concat([...labels, Uint8Array.of(0)]);
}

function withLength(bytes: Uint8Array, most: number, what: string): Uint8Array {
  if (bytes.length > most) throw new RangeError(`A ${what} is at most ${most} bytes`);
  return concat([Uint8Array.of(bytes.length), bytes]);
}

function ipv4Bytes(address: string): Uint8Array {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    throw new RangeError("An A record's address is IPv4, four numbers of 0 to 255");
  }
  return Uint8Array.from(parts);
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const whole = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    whole.set(part, offset);
    offset += part.length;
  }
  return whole;
}
