import { createHash, randomBytes } from "node:crypto";
import { connect, type Socket } from "node:net";
import { TestPhone } from "./e2e-phone.test-helper.ts";
import { FakePairing, FakePhones } from "./e2e-session.test-helper.ts";
import { FakeSource } from "./fake-source.test-helper.ts";
import { type GatewayListener, gatewayPath, startGatewayListener } from "./gateway-listener.ts";

/** Frame types a test client sends. */
export const op = { text: 1, binary: 2, close: 8, ping: 9 } as const;

/** The length bytes of a frame, with the mask bit when `masked`. */
function lengthBytes(length: number, masked: boolean): Buffer {
  const maskBit = masked ? 0x80 : 0;
  if (length < 126) return Buffer.from([maskBit | length]);
  if (length < 65_536) return Buffer.from([maskBit | 126, length >> 8, length & 255]);
  const size = Buffer.alloc(9);
  size[0] = maskBit | 127;
  size.writeBigUInt64BE(BigInt(length), 1);
  return size;
}

/** One masked client frame, as the protocol requires of a client. */
export function clientFrame(
  opcode: number,
  payload: Uint8Array,
  options: { mask?: boolean; fin?: boolean } = {},
): Buffer {
  const masked = options.mask !== false;
  const lead = Buffer.from([(options.fin === false ? 0 : 0x80) | opcode]);
  const size = lengthBytes(payload.length, masked);
  if (!masked) return Buffer.concat([lead, size, payload]);
  const key = randomBytes(4);
  const body = Buffer.from(payload).map((byte, at) => byte ^ (key[at % 4] ?? 0));
  return Buffer.concat([lead, size, key, body]);
}

export interface HandshakeOptions {
  host?: string;
  /** A second `Host` line, sent after the first. */
  secondHost?: string;
  origin?: string;
  path?: string;
  method?: string;
  version?: string;
  key?: string;
  upgrade?: boolean;
}

/** The handshake request, as text; options change one thing about it. */
export function handshakeRequest(
  port: number,
  options: HandshakeOptions = {},
): { text: string; key: string } {
  const key = options.key ?? randomBytes(16).toString("base64");
  const lines = [
    `${options.method ?? "GET"} ${options.path ?? gatewayPath} HTTP/1.1`,
    `Host: ${options.host ?? `127.0.0.1:${port}`}`,
    ...(options.secondHost === undefined ? [] : [`Host: ${options.secondHost}`]),
    ...(options.upgrade === false ? [] : ["Upgrade: websocket", "Connection: Upgrade"]),
    `Sec-WebSocket-Key: ${key}`,
    `Sec-WebSocket-Version: ${options.version ?? "13"}`,
    ...(options.origin === undefined ? [] : [`Origin: ${options.origin}`]),
  ];
  return { text: `${lines.join("\r\n")}\r\n\r\n`, key };
}

/** A raw client: sends bytes and collects what comes back. Once it has a phone, it speaks inside the session. */
export class RawClient {
  readonly socket: Socket;
  received = Buffer.alloc(0);
  ended: Promise<void>;
  /** The phone whose session it speaks in, after {@link RawClient.reconnect}. */
  phone: TestPhone | undefined;
  /** The gateway messages read from the host so far; each frame is decrypted once, in order. */
  readonly #messages: unknown[] = [];
  #framesRead = 0;

  constructor(port: number) {
    this.socket = connect(port, "127.0.0.1");
    this.ended = new Promise((resolve) => this.socket.once("close", () => resolve()));
    this.socket.on("data", (chunk: Buffer) => {
      this.received = Buffer.concat([this.received, chunk]);
    });
    this.socket.on("error", () => undefined);
  }

  write(data: Buffer | string): void {
    this.socket.write(data);
  }

  /** Waits until `check` holds for the bytes received so far. */
  async until(check: (text: string) => boolean): Promise<string> {
    for (let turn = 0; turn < 200; turn++) {
      const text = this.received.toString("latin1");
      if (check(text)) return text;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Never saw the expected bytes; got: ${this.received.toString("latin1")}`);
  }

  /** The frames of one type the host sent, raw; skips the HTTP response head. */
  framesOf(type: number): Buffer[] {
    const start = this.received.indexOf("\r\n\r\n");
    if (start === -1) return [];
    const frames: Buffer[] = [];
    let at = start + 4;
    while (at + 2 <= this.received.length) {
      const opcode = (this.received[at] ?? 0) & 0x0f;
      let length = (this.received[at + 1] ?? 0) & 0x7f;
      let header = 2;
      if (length === 126) {
        length = this.received.readUInt16BE(at + 2);
        header = 4;
      }
      if (at + header + length > this.received.length) break;
      if (opcode === type) frames.push(this.received.subarray(at + header, at + header + length));
      at += header + length;
    }
    return frames;
  }

  /** The gateway messages the host sent inside the session, decrypted by the phone. */
  messages(): unknown[] {
    const frames = this.framesOf(op.binary);
    for (; this.#framesRead < frames.length; this.#framesRead++) {
      const message = this.phone?.read(frames[this.#framesRead] ?? Buffer.alloc(0));
      if (message !== "rekey") this.#messages.push(message);
    }
    return [...this.#messages];
  }

  /** Reconnects as a phone to the host key it pinned, and reads the host's message 2. */
  async reconnect(hostKey: Uint8Array, phone = new TestPhone()): Promise<void> {
    this.phone = phone;
    this.write(clientFrame(op.binary, phone.resume1(hostKey)));
    for (let turn = 0; turn < 200 && this.framesOf(op.binary).length === 0; turn++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    phone.readResume2(this.framesOf(op.binary)[0] ?? Buffer.alloc(0));
    this.#framesRead = 1;
  }

  /** Opens the WebSocket: sends the handshake and waits for the 101. */
  async open(port: number, options: HandshakeOptions = {}): Promise<void> {
    const request = handshakeRequest(port, options);
    this.write(request.text);
    const head = await this.until((text) => text.includes("\r\n\r\n"));
    const accept = createHash("sha1")
      .update(`${request.key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    if (!head.startsWith("HTTP/1.1 101") || !head.includes(`Sec-WebSocket-Accept: ${accept}`)) {
      throw new Error(`Not upgraded: ${head}`);
    }
  }

  /** Sends one gateway message inside the session. */
  async sendJson(message: unknown): Promise<void> {
    if (this.phone === undefined) throw new Error("reconnect first");
    this.write(clientFrame(op.binary, this.phone.say(message)));
  }

  /** Waits until the host has sent `count` gateway messages inside the session. */
  async frames(count: number): Promise<unknown[]> {
    for (let turn = 0; turn < 200 && this.messages().length < count; turn++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return this.messages();
  }

  end(): void {
    this.socket.destroy();
  }
}

/** A listener on a fake source, and a way to open clients; `stop` ends all. */
export async function openListener(
  options: {
    allowRisky?: boolean;
    extraHosts?: string[];
    maxConnections?: number;
    heartbeatMs?: number;
    helloTimeoutMs?: number;
    handshakeTimeoutMs?: number;
  } = {},
) {
  const source = new FakeSource();
  const phones = new FakePhones();
  const pairing = new FakePairing(phones);
  const clients: RawClient[] = [];
  const errors: unknown[] = [];
  const listener: GatewayListener = await startGatewayListener({
    source,
    phones,
    pairing,
    onError: (error) => errors.push(error),
    policy: { allowRiskyRemotely: () => options.allowRisky === true },
    ...(options.extraHosts === undefined ? {} : { extraHosts: options.extraHosts }),
    ...(options.maxConnections === undefined ? {} : { maxConnections: options.maxConnections }),
    ...(options.heartbeatMs === undefined ? {} : { heartbeatMs: options.heartbeatMs }),
    ...(options.helloTimeoutMs === undefined ? {} : { helloTimeoutMs: options.helloTimeoutMs }),
    ...(options.handshakeTimeoutMs === undefined
      ? {}
      : { handshakeTimeoutMs: options.handshakeTimeoutMs }),
  });
  return {
    source,
    phones,
    pairing,
    /** What the listener reported through `onError`. */
    errors,
    listener,
    client(): RawClient {
      const client = new RawClient(listener.port);
      clients.push(client);
      return client;
    },
    /** A client of a paired phone, connected and reconnected into its session. */
    async pairedClient(): Promise<RawClient> {
      const client = this.client();
      const phone = new TestPhone();
      phones.pair(phone.keys.publicKey);
      await client.open(listener.port);
      await client.reconnect(phones.host.publicKey, phone);
      return client;
    },
    async stop(): Promise<void> {
      for (const client of clients) client.end();
      await listener.close();
    },
  };
}
