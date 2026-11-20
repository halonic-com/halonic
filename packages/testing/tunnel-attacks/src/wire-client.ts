import { createHash, randomBytes } from "node:crypto";
import { connect, type Socket } from "node:net";
import type { RigPhone } from "./rig-phone.ts";

/** The frame types a client sends. */
export const op = { continuation: 0, text: 1, binary: 2, close: 8, ping: 9, pong: 10 } as const;

const handshakeGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/** The length bytes of a frame, in the shortest form, with the mask bit when `masked`. */
function lengthBytes(length: number, masked: boolean): Buffer {
  const maskBit = masked ? 0x80 : 0;
  if (length < 126) return Buffer.from([maskBit | length]);
  if (length < 65_536) return Buffer.from([maskBit | 126, length >> 8, length & 255]);
  const size = Buffer.alloc(9);
  size[0] = maskBit | 127;
  size.writeBigUInt64BE(BigInt(length), 1);
  return size;
}

/** What a hostile client may change in a frame; each option left out is what the protocol requires. */
export interface WireFrameOptions {
  /** `false` sends an unmasked frame. */
  mask?: boolean;
  /** `false` leaves the final bit off, as a fragment that has more to come. */
  fin?: boolean;
  /** The three reserved bits (4 = rsv1, 2 = rsv2, 1 = rsv3). */
  reserved?: number;
}

/** One client frame. */
export function wireFrame(
  opcode: number,
  payload: Uint8Array,
  options: WireFrameOptions = {},
): Buffer {
  const masked = options.mask !== false;
  const lead = Buffer.from([
    (options.fin === false ? 0 : 0x80) | ((options.reserved ?? 0) << 4) | opcode,
  ]);
  const size = lengthBytes(payload.length, masked);
  if (!masked) return Buffer.concat([lead, size, payload]);
  const key = randomBytes(4);
  const body = Buffer.from(payload).map((byte, at) => byte ^ (key[at % 4] ?? 0));
  return Buffer.concat([lead, size, key, body]);
}

/** What a handshake request may get wrong; each option left out is what a phone sends. */
export interface HandshakeOptions {
  /** The whole `Host` line's value; `null` sends none. */
  host?: string | null;
  /** Extra header lines, as written, such as `Origin: null`. */
  headers?: readonly string[];
  /** The request target; `/v1/gateway` by default. */
  target?: string;
  method?: string;
}

/** The handshake as text, with one thing changed. */
export function handshakeText(
  port: number,
  options: HandshakeOptions = {},
  key = randomBytes(16).toString("base64"),
): string {
  const lines = [
    `${options.method ?? "GET"} ${options.target ?? "/v1/gateway"} HTTP/1.1`,
    ...(options.host === null ? [] : [`Host: ${options.host ?? `127.0.0.1:${port}`}`]),
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${key}`,
    "Sec-WebSocket-Version: 13",
    ...(options.headers ?? []),
  ];
  return `${lines.join("\r\n")}\r\n\r\n`;
}

/**
 * A raw client: it sends any bytes and keeps what comes back. Once it has
 * reconnected as a paired phone, its messages travel inside the end-to-end
 * session, as a phone's do; until then, what it sends is cleartext.
 */
export class WireClient {
  readonly socket: Socket;
  received = Buffer.alloc(0);
  /** The paired phone it speaks as, after {@link WireClient.reconnect}. */
  phone: RigPhone | undefined;
  /** The gateway messages read so far: each frame is decrypted once, in order. */
  readonly #messages: unknown[] = [];
  #binaryRead = 0;
  /** Resolves when the connection has closed, from either side. */
  readonly closed: Promise<void>;

  constructor(port: number, host = "127.0.0.1") {
    this.socket = connect(port, host);
    this.closed = new Promise((resolve) => this.socket.once("close", () => resolve()));
    this.socket.on("data", (chunk: Buffer) => {
      this.received = Buffer.concat([this.received, chunk]);
    });
    this.socket.on("error", () => undefined);
  }

  write(data: Buffer | string): void {
    this.socket.write(data);
  }

  /** Waits until `check` holds for what has come back so far (as latin1 text). */
  async until(check: (text: string) => boolean): Promise<string> {
    for (let turn = 0; turn < 300; turn++) {
      const text = this.received.toString("latin1");
      if (check(text)) return text;
      if (this.socket.destroyed) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return this.received.toString("latin1");
  }

  /** Sends a handshake and gives the status line of the answer, or "" when none came. */
  async handshake(port: number, options: HandshakeOptions = {}): Promise<string> {
    this.write(handshakeText(port, options));
    const text = await this.until((seen) => seen.includes("\r\n"));
    return text.split("\r\n")[0] ?? "";
  }

  /** Opens the WebSocket, and throws when the host doesn't upgrade it. */
  async open(port: number, options: HandshakeOptions = {}): Promise<void> {
    const key = randomBytes(16).toString("base64");
    this.write(handshakeText(port, options, key));
    const head = await this.until((seen) => seen.includes("\r\n\r\n"));
    const accept = createHash("sha1").update(`${key}${handshakeGuid}`).digest("base64");
    if (!head.startsWith("HTTP/1.1 101") || !head.includes(`Sec-WebSocket-Accept: ${accept}`)) {
      throw new Error(`The host didn't upgrade the connection: ${head.split("\r\n")[0]}`);
    }
  }

  /** Reconnects as `phone` to the host key it pinned, and waits for the host's message 2. */
  async reconnect(phone: RigPhone): Promise<void> {
    this.write(wireFrame(op.binary, phone.resume1()));
    const answered = () => this.hostFrames(op.binary).length > 0;
    for (let turn = 0; turn < 300 && !answered() && !this.socket.destroyed; turn++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (phone.read(this.hostFrames(op.binary)[0] ?? Buffer.alloc(0)) !== "resume2") {
      throw new Error("The host didn't answer the reconnect.");
    }
    this.phone = phone;
    this.#binaryRead = 1;
  }

  /**
   * Sends `json` as it is, or the JSON of a value: inside the session once the
   * client has reconnected, else as a cleartext text frame.
   */
  sendText(json: string | Uint8Array): void {
    const bytes = typeof json === "string" ? Buffer.from(json) : json;
    this.write(
      this.phone === undefined
        ? wireFrame(op.text, bytes)
        : wireFrame(op.binary, this.phone.seal(bytes)),
    );
  }

  sendJson(message: unknown): void {
    this.sendText(JSON.stringify(message));
  }

  /**
   * The gateway messages the host sent, parsed: inside the session once the
   * client has reconnected. A cleartext text frame is listed too, as the
   * string `cleartext:` and its text, so a test that expects none sees one.
   */
  textFrames(): unknown[] {
    const leaked = this.hostFrames(op.text).map(
      (payload) => `cleartext:${payload.toString("utf8")}`,
    );
    const sealed = this.hostFrames(op.binary);
    for (; this.phone !== undefined && this.#binaryRead < sealed.length; this.#binaryRead++) {
      const read = this.phone.read(sealed[this.#binaryRead] ?? Buffer.alloc(0));
      if (read instanceof Uint8Array)
        this.#messages.push(JSON.parse(Buffer.from(read).toString("utf8")));
    }
    return [...leaked, ...this.#messages];
  }

  /** The payloads of the host's frames of one type, after the HTTP handshake. */
  hostFrames(opcode: number): Buffer[] {
    const start = this.received.indexOf("\r\n\r\n");
    if (start === -1) return [];
    const frames: Buffer[] = [];
    let at = start + 4;
    for (let frame = readFrame(this.received, at); frame !== undefined; ) {
      if (frame.opcode === opcode) frames.push(frame.payload);
      at += frame.size;
      frame = readFrame(this.received, at);
    }
    return frames;
  }

  /** Waits until `count` text frames came, or the connection ended, and gives the frames so far. */
  async frames(count: number): Promise<unknown[]> {
    for (let turn = 0; turn < 300 && this.textFrames().length < count; turn++) {
      if (this.socket.destroyed) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return this.textFrames();
  }

  /** Whether the connection has ended, after giving it a moment to. */
  async isClosed(): Promise<boolean> {
    await Promise.race([this.closed, new Promise((resolve) => setTimeout(resolve, 1_500))]);
    return this.socket.destroyed;
  }

  end(): void {
    this.socket.destroy();
  }
}

/** The host's frame at `at` when all of it has come: its type, its payload and its size in bytes. */
function readFrame(
  bytes: Buffer,
  at: number,
): { opcode: number; payload: Buffer; size: number } | undefined {
  if (at + 2 > bytes.length) return undefined;
  const opcode = (bytes[at] ?? 0) & 0x0f;
  const short = (bytes[at + 1] ?? 0) & 0x7f;
  let header = 2;
  let length = short;
  if (short === 126 && at + 4 <= bytes.length) {
    header = 4;
    length = bytes.readUInt16BE(at + 2);
  } else if (short === 127 && at + 10 <= bytes.length) {
    header = 10;
    length = Number(bytes.readBigUInt64BE(at + 2));
  } else if (short >= 126) {
    return undefined;
  }
  if (at + header + length > bytes.length) return undefined;
  return {
    opcode,
    payload: bytes.subarray(at + header, at + header + length),
    size: header + length,
  };
}
