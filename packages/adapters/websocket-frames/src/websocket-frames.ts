/** The WebSocket frame types (RFC 6455) we use; we speak no extensions and no fragments. */
export const frameType = { text: 0x1, binary: 0x2, close: 0x8, ping: 0x9, pong: 0xa } as const;

/**
 * Who sent the frames a {@link FrameReader} reads. A client must mask every
 * frame and a server must mask none (RFC 6455, 5.1), so a frame that breaks
 * its sender's rule is a protocol error.
 */
export type FrameSender = "client" | "server";

/** What {@link FrameReader} found in the bytes it was given. */
export type FrameEvent =
  | { readonly kind: "message"; readonly binary: boolean; readonly bytes: Uint8Array }
  | { readonly kind: "ping"; readonly bytes: Uint8Array }
  | { readonly kind: "pong" }
  /** A close frame; `bytes` holds its status code and reason, if any (RFC 6455, 5.5.1). */
  | { readonly kind: "close"; readonly bytes: Uint8Array }
  /** A message frame that declares more bytes than allowed; none of it was kept. */
  | { readonly kind: "too-large" }
  /** Bytes that break the format; the connection must end. */
  | { readonly kind: "protocol-error" };

/** The largest payload a control frame may have (RFC 6455, 5.5). */
const maxControlPayload = 125;

/**
 * Reads the frames the other side sends, from bytes as they arrive. It accepts
 * only what a well-behaved peer sends: unfragmented frames of a known type,
 * masked by a client and unmasked by a server, with the reserved bits clear
 * (no extension is ever negotiated). A message frame whose declared length is
 * over the limit is refused from its header alone, so a peer can't make us
 * hold more than one message. After `too-large` or `protocol-error` it reads
 * nothing more.
 */
export class FrameReader {
  /** Chunks received and not yet read, kept apart until a whole frame can be made of them. */
  private chunks: Buffer[] = [];
  private pendingBytes = 0;
  /** How many bytes `chunks` must hold before reading is worth trying again. */
  private neededBytes = 0;
  private stopped = false;
  private readonly maxPayload: number;
  private readonly sender: FrameSender;

  /** Reads frames of at most `maxPayload` bytes from `sender`; a server reads a client's by default. */
  constructor(maxPayload: number, sender: FrameSender = "client") {
    this.maxPayload = maxPayload;
    this.sender = sender;
  }

  /** Adds `chunk` and returns the events its complete frames make, in order. */
  push(chunk: Uint8Array): FrameEvent[] {
    if (this.stopped) return [];
    this.chunks.push(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
    this.pendingBytes += chunk.length;
    if (this.pendingBytes < this.neededBytes) return [];
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
    const pending = this.joinedChunks();
    const header = readHeader(pending, this.sender === "client");
    if (header === undefined) {
      // The header's length bytes are not all here; the next byte may complete them.
      this.neededBytes = pending.length + 1;
      return undefined;
    }
    if (header.problem !== undefined) return { kind: header.problem };
    if (header.length > this.maxPayload) return { kind: "too-large" };
    const maskLength = this.sender === "client" ? 4 : 0;
    const end = header.dataStart + maskLength + header.length;
    if (pending.length < end) {
      this.neededBytes = end;
      return undefined;
    }
    const bytes = Buffer.from(pending.subarray(header.dataStart + maskLength, end));
    if (maskLength > 0) applyMask(bytes, pending.subarray(header.dataStart, header.dataStart + 4));
    this.keep(pending.subarray(end));
    return eventOf(header.opcode, bytes);
  }

  /** All the unread bytes as one buffer; the copy happens only when there is more than one chunk. */
  private joinedChunks(): Buffer {
    if (this.chunks.length > 1) this.keep(Buffer.concat(this.chunks));
    return this.chunks[0] ?? Buffer.alloc(0);
  }

  /** Makes `rest` the unread bytes. */
  private keep(rest: Buffer): void {
    this.chunks = rest.length > 0 ? [rest] : [];
    this.pendingBytes = rest.length;
    this.neededBytes = 0;
  }
}

interface Header {
  readonly opcode: number;
  readonly length: number;
  /** Where the mask starts, or the payload when the frame has no mask. */
  readonly dataStart: number;
  readonly problem?: "protocol-error";
}

/** The frame's header, or `undefined` when more bytes are needed to read it. */
function readHeader(bytes: Buffer, masked: boolean): Header | undefined {
  if (bytes.length < 2) return undefined;
  const first = bytes[0] ?? 0;
  const second = bytes[1] ?? 0;
  const opcode = first & 0x0f;
  const isControl = opcode >= 0x8;
  const short = second & 0x7f;
  const wrong =
    (first & 0xf0) !== 0x80 || // not final, or a reserved bit is set
    (second & 0x80) !== (masked ? 0x80 : 0) || // a client must mask, a server must not
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
      return { kind: "close", bytes };
  }
}

/** XORs `bytes` in place with the 4-byte `mask`, which both masks and unmasks (RFC 6455, 5.3). */
function applyMask(bytes: Buffer, mask: Uint8Array): void {
  for (let at = 0; at < bytes.length; at++) bytes[at] = (bytes[at] ?? 0) ^ (mask[at % 4] ?? 0);
}

/**
 * One frame with the shortest length form: unmasked, as a server sends it, or
 * masked with the 4 random bytes of `mask`, as a client must send it.
 */
export function encodeFrame(opcode: number, payload: Uint8Array, mask?: Uint8Array): Buffer {
  if (mask !== undefined && mask.length !== 4) throw new RangeError("A frame mask is 4 bytes.");
  const length = payload.length;
  const maskBit = mask === undefined ? 0 : 0x80;
  let header: Buffer;
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, maskBit | length]);
  } else if (length < 65_536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = maskBit | 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = maskBit | 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  if (mask === undefined) return Buffer.concat([header, payload]);
  const body = Buffer.from(payload);
  applyMask(body, mask);
  return Buffer.concat([header, mask, body]);
}
