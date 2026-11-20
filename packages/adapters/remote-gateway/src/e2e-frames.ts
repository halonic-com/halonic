import { type GatewayFrameKind, gatewayFrameKinds } from "@halonicjs/ports";

/** One binary frame of the end-to-end session, read: its kind and the Noise message after it. */
export interface E2eFrame {
  readonly kind: GatewayFrameKind;
  readonly body: Uint8Array;
}

const kindsByByte = new Map<number, GatewayFrameKind>(
  Object.entries(gatewayFrameKinds).map(([kind, byte]) => [byte, kind as GatewayFrameKind]),
);

/** Reads a binary frame's kind byte, or gives `undefined` for an empty frame or an unknown kind. */
export function readE2eFrame(bytes: Uint8Array): E2eFrame | undefined {
  const kind = kindsByByte.get(bytes[0] ?? -1);
  return kind === undefined ? undefined : { kind, body: bytes.subarray(1) };
}

/** Writes a frame: the kind byte, then the Noise message. */
export function encodeE2eFrame(kind: GatewayFrameKind, body: Uint8Array): Uint8Array {
  const frame = new Uint8Array(1 + body.length);
  frame[0] = gatewayFrameKinds[kind];
  frame.set(body, 1);
  return frame;
}
