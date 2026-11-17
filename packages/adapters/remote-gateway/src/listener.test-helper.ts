import { createHash, randomBytes } from "node:crypto";
import { connect, type Socket } from "node:net";
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

/** A raw client: sends bytes and collects what comes back. */
export class RawClient {
  readonly socket: Socket;
  received = Buffer.alloc(0);
  ended: Promise<void>;

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

  /** The text frames the host sent, decoded; skips the HTTP response head and non-text frames. */
  textFrames(): unknown[] {
    const start = this.received.indexOf("\r\n\r\n");
    if (start === -1) return [];
    const frames: unknown[] = [];
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
      if (opcode === 1)
        frames.push(
          JSON.parse(this.received.subarray(at + header, at + header + length).toString("utf8")),
        );
      at += header + length;
    }
    return frames;
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

  async sendJson(message: unknown): Promise<void> {
    this.write(clientFrame(op.text, Buffer.from(JSON.stringify(message))));
  }

  /** Waits until the host has sent `count` text frames. */
  async frames(count: number): Promise<unknown[]> {
    for (let turn = 0; turn < 200 && this.textFrames().length < count; turn++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return this.textFrames();
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
  } = {},
) {
  const source = new FakeSource();
  const clients: RawClient[] = [];
  const listener: GatewayListener = await startGatewayListener({
    source,
    policy: { allowRiskyRemotely: () => options.allowRisky === true },
    ...(options.extraHosts === undefined ? {} : { extraHosts: options.extraHosts }),
    ...(options.maxConnections === undefined ? {} : { maxConnections: options.maxConnections }),
    ...(options.heartbeatMs === undefined ? {} : { heartbeatMs: options.heartbeatMs }),
    ...(options.helloTimeoutMs === undefined ? {} : { helloTimeoutMs: options.helloTimeoutMs }),
  });
  return {
    source,
    listener,
    client(): RawClient {
      const client = new RawClient(listener.port);
      clients.push(client);
      return client;
    },
    async stop(): Promise<void> {
      for (const client of clients) client.end();
      await listener.close();
    },
  };
}
