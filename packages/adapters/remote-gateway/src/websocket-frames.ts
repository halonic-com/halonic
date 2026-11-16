/** The WebSocket frame types (RFC 6455) this server uses; it speaks no extensions and no fragments. */
export const frameType = { text: 0x1, binary: 0x2, close: 0x8, ping: 0x9, pong: 0xa } as const;

/** What {@link FrameReader} found in the bytes it was given. */
export type FrameEvent =
  | { readonly kind: "message"; readonly binary: boolean; readonly bytes: Uint8Array }
  | { readonly kind: "ping"; readonly bytes: Uint8Array }
  | { readonly kind: "pong" }
  | { readonly kind: "close" }
  /** A message frame that declares more bytes than allowed; none of it was kept. */
  | { readonly kind: "too-large" }
  /** Bytes that break the format; the connection must end. */
  | { readonly kind: "protocol-error" };

/** The largest payload a control frame may have (RFC 6455, 5.5). */
const maxControlPayload = 125;

/**
 * Reads the frames a client sends, from bytes as they arrive. It accepts only
 * what a well-behaved client sends here: masked, unfragmented frames of a
 * known type, with the reserved bits clear (no extension is ever negotiated).
 * A message frame whose declared length is over the limit is refused from its
 * header alone, so a client can't make the host hold more than one message.
 * After `too-large` or `protocol-error` it reads nothing more.
 */
export class FrameReader {
  private pending = Buffer.alloc(0);
  private stopped = false;
  private readonly maxPayload: number;

  constructor(maxPayload: number) {
    this.maxPayload = maxPayload;
  }

  /** Adds `chunk` and returns the events its complete frames make, in order. */
  push(chunk: Uint8Array): FrameEvent[] {
    if (this.stopped) return [];
    this.pending = Buffer.concat([this.pending, chunk]);
    const events: FrameEvent[] = [];
    while (!this.stopped) {
      const event = this.readFrame();
      if (event === undefined) break;
      events.push(event);
      if (event.kind === "too-large" || event.kind === "protocol-error") this.stopped = true;
    }
    return events;
  }

  /** The next frame's event, or `undefined` when the bytes so far don't hold a whole frame. */
  private readFrame(): FrameEvent | undefined {
    const header = readHeader(this.pending);
    if (header === undefined) return undefined;
    if (header.problem !== undefined) return { kind: header.problem };
    if (header.length > this.maxPayload) return { kind: "too-large" };
    const end = header.dataStart + 4 + header.length;
    if (this.pending.length < end) return undefined;
    const mask = this.pending.subarray(header.dataStart, header.dataStart + 4);
    const bytes = Buffer.from(this.pending.subarray(header.dataStart + 4, end));
    for (let at = 0; at < bytes.length; at++) bytes[at] = (bytes[at] ?? 0) ^ (mask[at % 4] ?? 0);
    this.pending = this.pending.subarray(end);
    return eventOf(header.opcode, bytes);
  }
}

interface Header {
  readonly opcode: number;
  readonly length: number;
  /** Where the mask starts. */
  readonly dataStart: number;
  readonly problem?: "protocol-error";
}

/** The frame's header, or `undefined` when more bytes are needed to read it. */
function readHeader(bytes: Buffer): Header | undefined {
  if (bytes.length < 2) return undefined;
  const first = bytes[0] ?? 0;
  const second = bytes[1] ?? 0;
  const opcode = first & 0x0f;
  const isControl = opcode >= 0x8;
  const short = second & 0x7f;
  const wrong =
    (first & 0xf0) !== 0x80 || // not final, or a reserved bit is set
    (second & 0x80) === 0 || // a client must mask
    ![0x1, 0x2, 0x8, 0x9, 0xa].includes(opcode) || // continuation and reserved types
    (isControl && short > maxControlPayload);
  if (wrong) return { opcode, length: 0, dataStart: 2, problem: "protocol-error" };
  if (short < 126) return { opcode, length: short, dataStart: 2 };
  if (short === 126) {
    return bytes.length < 4 ? undefined : { opcode, length: bytes.readUInt16BE(2), dataStart: 4 };
  }
  if (bytes.length < 10) return undefined;
  const length = bytes.readBigUInt64BE(2);
  // Anything this large is over every limit; the number is only compared, never used as a size.
  return {
    opcode,
    length: length > BigInt(Number.MAX_SAFE_INTEGER) ? Infinity : Number(length),
    dataStart: 10,
  };
}

function eventOf(opcode: number, bytes: Buffer): FrameEvent {
  switch (opcode) {
    case frameType.text:
      return { kind: "message", binary: false, bytes };
    case frameType.binary:
      return { kind: "message", binary: true, bytes };
    case frameType.ping:
      return { kind: "ping", bytes };
    case frameType.pong:
      return { kind: "pong" };
    default:
      return { kind: "close" };
  }
}

/** One unmasked frame, as a server sends it. */
export function encodeFrame(opcode: number, payload: Uint8Array): Buffer {
  const length = payload.length;
  let header: Buffer;
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length < 65_536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}
