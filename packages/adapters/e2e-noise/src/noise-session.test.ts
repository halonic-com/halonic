import { randomBytes } from "node:crypto";
import { noiseMaxMessageBytes } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { NoiseSession, NoiseSessionError, type NoiseSessionOptions } from "./noise-session.ts";
import type { InstantiateNoise } from "./noise-wasm.ts";
import {
  fixedRandom,
  keepingInstances,
  memoryHolds,
  memoryIsZero,
  publicKeyOf,
  send,
} from "./session.test-helper.ts";

const tagBytes = 16;
// Plain arrays, not Buffers: a Buffer's slice() is a view, so the session
// would zero these along with the copy it was given.
const hostKey = Uint8Array.from(randomBytes(32));
const phoneKey = Uint8Array.from(randomBytes(32));
const psk = Uint8Array.from(randomBytes(32));

/** Options for one side; the keys are copies, since a session zeroes what it is given. */
function pairingOptions(role: "initiator" | "responder"): NoiseSessionOptions {
  const key = role === "initiator" ? phoneKey : hostKey;
  return { handshake: "pairing", role, localPrivateKey: key.slice(), psk: psk.slice() };
}

/** A phone and a host paired, ready for transport messages. */
function paired(instantiate?: InstantiateNoise): { phone: NoiseSession; host: NoiseSession } {
  const phone = NoiseSession.start(pairingOptions("initiator"), instantiate);
  const host = NoiseSession.start(pairingOptions("responder"), instantiate);
  send(phone, host, new Uint8Array());
  send(host, phone, new Uint8Array());
  send(phone, host, new Uint8Array());
  return { phone, host };
}

verifies("e2e-noise.session-wiped", () => {
  it("zeroes the instance's whole memory when the session ends", () => {
    const { instantiate, instances } = keepingInstances();
    const { phone, host } = paired(instantiate);
    const payload = new TextEncoder().encode("a payload only these two sessions saw");
    send(phone, host, payload);
    host.rekeyOutgoing();
    phone.rekeyIncoming();
    send(host, phone, payload);
    const hash = host.handshakeHash();
    const [, hostInstance] = instances;
    if (hostInstance === undefined) throw new Error("no host instance");
    expect(memoryHolds(hostInstance, hash)).toBe(true);
    host.end();
    phone.end();
    for (const instance of instances) {
      for (const secret of [hostKey, phoneKey, psk, hash, payload]) {
        expect(memoryHolds(instance, secret)).toBe(false);
      }
      expect(memoryIsZero(instance)).toBe(true);
    }
    expect(host.ended && phone.ended).toBe(true);
    host.end();
  });

  it("zeroes the memory of a session that failed", () => {
    const { instantiate, instances } = keepingInstances();
    const { phone, host } = paired(instantiate);
    const message = phone.writeMessage(new Uint8Array(8));
    message[0] = (message[0] ?? 0) ^ 1;
    expect(() => host.readMessage(message)).toThrow(NoiseSessionError);
    const hostInstance = instances[1];
    if (hostInstance === undefined) throw new Error("no host instance");
    expect(memoryIsZero(hostInstance)).toBe(true);
    expect(host.ended).toBe(true);
  });

  it("zeroes the private key and the psk it was given, whether or not it starts", () => {
    const options = pairingOptions("responder");
    NoiseSession.start(options).end();
    expect(options.localPrivateKey.every((byte) => byte === 0)).toBe(true);
    expect(options.psk?.every((byte) => byte === 0)).toBe(true);
    const refused = { ...pairingOptions("responder"), handshake: "reconnect" } as const;
    expect(() => NoiseSession.start(refused)).toThrow(NoiseSessionError);
    expect(refused.localPrivateKey.every((byte) => byte === 0)).toBe(true);
    expect(refused.psk?.every((byte) => byte === 0)).toBe(true);
  });

  it("gives every session its own instance", () => {
    const { instantiate, instances } = keepingInstances();
    paired(instantiate);
    expect(instances).toHaveLength(2);
    expect(instances[0]?.memory).not.toBe(instances[1]?.memory);
  });
});

verifies("e2e-noise.fails-for-good", () => {
  it("fails for good after writing when it is time to read", () => {
    const host = NoiseSession.start(pairingOptions("responder"));
    const phone = NoiseSession.start(pairingOptions("initiator"));
    expect(() => host.writeMessage(new Uint8Array())).toThrow(NoiseSessionError);
    expect(() => host.readMessage(phone.writeMessage(new Uint8Array()))).toThrow(NoiseSessionError);
    expect(() => host.isTransport).toThrow(NoiseSessionError);
  });

  it("refuses a replayed, a reordered and a later message after a failure", () => {
    const replay = paired();
    const first = replay.phone.writeMessage(new Uint8Array([1]));
    const second = replay.phone.writeMessage(new Uint8Array([2]));
    replay.host.readMessage(first);
    expect(() => replay.host.readMessage(first)).toThrow(NoiseSessionError);
    expect(() => replay.host.readMessage(second)).toThrow(NoiseSessionError);

    const reorder = paired();
    reorder.phone.writeMessage(new Uint8Array([1]));
    const later = reorder.phone.writeMessage(new Uint8Array([2]));
    expect(() => reorder.host.readMessage(later)).toThrow(NoiseSessionError);
  });

  it("takes payloads from empty to the Noise maximum, and ends on one byte more", () => {
    const { phone, host } = paired();
    for (const length of [0, 1, noiseMaxMessageBytes - tagBytes]) {
      const payload = new Uint8Array(length).fill(0x5a);
      expect(send(phone, host, payload)).toEqual(payload);
      expect(send(host, phone, payload)).toEqual(payload);
    }
    expect(() => host.writeMessage(new Uint8Array(noiseMaxMessageBytes - tagBytes + 1))).toThrow(
      NoiseSessionError,
    );
    expect(host.ended).toBe(true);
  });

  it("ends on a 65,536-byte message before copying it", () => {
    const { instantiate, instances } = keepingInstances();
    const { host } = paired(instantiate);
    expect(() => host.readMessage(new Uint8Array(noiseMaxMessageBytes + 1).fill(7))).toThrow(
      NoiseSessionError,
    );
    const hostInstance = instances[1];
    if (hostInstance === undefined) throw new Error("no host instance");
    expect(memoryIsZero(hostInstance)).toBe(true);
  });

  it("ends when the instance traps", () => {
    const { instantiate, instances } = keepingInstances();
    const trapping: InstantiateNoise = (randomFill) => {
      const exports = instantiate(randomFill);
      return {
        ...exports,
        noise_write: () => {
          throw new WebAssembly.RuntimeError("unreachable");
        },
      };
    };
    const session = NoiseSession.start(pairingOptions("initiator"), trapping);
    expect(() => session.writeMessage(new Uint8Array())).toThrow(NoiseSessionError);
    expect(session.ended).toBe(true);
    const [instance] = instances;
    if (instance === undefined) throw new Error("no instance");
    expect(memoryIsZero(instance)).toBe(true);
  });

  it("refuses an instance whose buffers don't hold one Noise message", () => {
    const { instantiate, instances } = keepingInstances();
    const smaller: InstantiateNoise = (randomFill) => ({
      ...instantiate(randomFill),
      noise_buffer_bytes: () => noiseMaxMessageBytes - 1,
    });
    expect(() => NoiseSession.start(pairingOptions("responder"), smaller)).toThrow(
      NoiseSessionError,
    );
    const [instance] = instances;
    if (instance === undefined) throw new Error("no instance");
    expect(memoryIsZero(instance)).toBe(true);
  });

  it("refuses keys that don't fit the handshake or the role", () => {
    const remotePublicKey = publicKeyOf(hostKey);
    const refused: NoiseSessionOptions[] = [
      { handshake: "pairing", role: "responder", localPrivateKey: hostKey.slice() },
      { ...pairingOptions("initiator"), remotePublicKey },
      { handshake: "reconnect", role: "initiator", localPrivateKey: phoneKey.slice() },
      {
        handshake: "reconnect",
        role: "responder",
        localPrivateKey: hostKey.slice(),
        remotePublicKey,
      },
      { ...pairingOptions("responder"), localPrivateKey: new Uint8Array(31) },
      { ...pairingOptions("responder"), psk: new Uint8Array(33) },
    ];
    for (const options of refused) {
      expect(() => NoiseSession.start(options)).toThrow(NoiseSessionError);
    }
  });

  it("throws on every call once it has ended, without saying why", () => {
    const { host } = paired();
    host.end();
    for (const call of [
      () => host.writeMessage(new Uint8Array()),
      () => host.readMessage(new Uint8Array()),
      () => host.handshakeHash(),
      () => host.remoteStaticKey(),
      () => host.rekeyOutgoing(),
      () => host.rekeyIncoming(),
    ]) {
      expect(call).toThrow("The Noise session failed or ended");
    }
  });

  it("refuses transport calls before the handshake is over", () => {
    const host = NoiseSession.start(pairingOptions("responder"));
    expect(host.isTransport).toBe(false);
    expect(() => host.handshakeHash()).toThrow(NoiseSessionError);
    expect(host.ended).toBe(true);
  });

  it("reconnects to the pinned host key, and each side learns the other's key", () => {
    const phone = NoiseSession.start({
      handshake: "reconnect",
      role: "initiator",
      localPrivateKey: phoneKey.slice(),
      remotePublicKey: publicKeyOf(hostKey),
    });
    const host = NoiseSession.start({
      handshake: "reconnect",
      role: "responder",
      localPrivateKey: hostKey.slice(),
    });
    send(phone, host, new Uint8Array());
    send(host, phone, new Uint8Array());
    expect(host.remoteStaticKey()).toEqual(publicKeyOf(phoneKey));
    expect(phone.remoteStaticKey()).toEqual(publicKeyOf(hostKey));
    expect(phone.handshakeHash()).toEqual(host.handshakeHash());
  });
});

verifies("e2e-noise.host-randomness", () => {
  it("sends a different first message from every session", () => {
    const first = () =>
      NoiseSession.start(pairingOptions("initiator")).writeMessage(new Uint8Array());
    expect(first()).not.toEqual(first());
  });

  it("fails the handshake when the random function throws", () => {
    const throwing = () => {
      throw new Error("no randomness");
    };
    const runOut = fixedRandom(new Uint8Array(0));
    for (const randomFill of [throwing, runOut]) {
      const session = NoiseSession.start({ ...pairingOptions("initiator"), randomFill });
      expect(() => session.writeMessage(new Uint8Array())).toThrow(NoiseSessionError);
      expect(session.ended).toBe(true);
    }
  });
});
