import { createPrivateKey, createPublicKey } from "node:crypto";
import type { NoiseSession } from "./noise-session.ts";
import { type InstantiateNoise, instantiateNoise, type NoiseExports } from "./noise-wasm.ts";

/** Bytes from hex. */
export function fromHex(text: string): Uint8Array {
  return Uint8Array.from(Buffer.from(text, "hex"));
}

/** Hex from bytes. */
export function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

/** The DER prefix of an X25519 private key in PKCS #8, before its 32 bytes. */
const pkcs8X25519Prefix = fromHex("302e020100300506032b656e04220420");

/** The X25519 public key of a private key, from `node:crypto`: the last 32 bytes of its SPKI. */
export function publicKeyOf(privateKey: Uint8Array): Uint8Array {
  const der = Buffer.concat([pkcs8X25519Prefix, privateKey]);
  const publicKey = createPublicKey(createPrivateKey({ key: der, format: "der", type: "pkcs8" }));
  const spki = publicKey.export({ format: "der", type: "spki" });
  return Uint8Array.from(spki.subarray(-32));
}

/**
 * A random function that gives exactly these bytes, once. Any other call
 * throws: a different length, or any call after the first, when none are left.
 */
export function fixedRandom(bytes: Uint8Array): (into: Uint8Array) => void {
  let left = bytes;
  return (into) => {
    if (left.length !== into.length) throw new Error("no more random bytes");
    into.set(left);
    left = new Uint8Array(0);
  };
}

/** Instantiates `noise.wasm` and keeps every instance's exports, to look at their memory. */
export function keepingInstances(): { instantiate: InstantiateNoise; instances: NoiseExports[] } {
  const instances: NoiseExports[] = [];
  const instantiate: InstantiateNoise = (randomFill) => {
    const exports = instantiateNoise(randomFill);
    instances.push(exports);
    return exports;
  };
  return { instantiate, instances };
}

/** Whether `needle` appears anywhere in the instance's memory. */
export function memoryHolds(exports: NoiseExports, needle: Uint8Array): boolean {
  return Buffer.from(exports.memory.buffer).includes(Buffer.from(needle));
}

/** Whether the instance's whole memory is zero. */
export function memoryIsZero(exports: NoiseExports): boolean {
  return new Uint8Array(exports.memory.buffer).every((byte) => byte === 0);
}

/** Sends `payload` from one session to the other and returns what arrived. */
export function send(from: NoiseSession, to: NoiseSession, payload: Uint8Array): Uint8Array {
  return to.readMessage(from.writeMessage(payload));
}
