import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type NoiseHandshake, NoiseSession } from "./noise-session.ts";
import { fixedRandom, fromHex, toHex } from "./session.test-helper.ts";

/** The published vectors, kept with the crate, whose native tests read them too. */
const vectorsFile = new URL(
  "../../../../apps/studio/src-tauri/crates/e2e-noise-wasm/tests/vectors.json",
  import.meta.url,
);

interface Vector {
  readonly source: string;
  readonly protocol_name: string;
  readonly init_prologue: string;
  readonly init_psks?: readonly string[];
  readonly init_static: string;
  readonly init_ephemeral: string;
  readonly init_remote_static?: string;
  readonly resp_prologue: string;
  readonly resp_psks?: readonly string[];
  readonly resp_static: string;
  readonly resp_ephemeral: string;
  readonly handshake_hash?: string;
  readonly messages: readonly { readonly payload: string; readonly ciphertext: string }[];
}

const vectors: readonly Vector[] = JSON.parse(readFileSync(vectorsFile, "utf8")).vectors;

const handshakes: Readonly<Record<string, NoiseHandshake>> = {
  Noise_XXpsk3_25519_ChaChaPoly_SHA256: "pairing",
  Noise_IK_25519_ChaChaPoly_SHA256: "reconnect",
};

function startInitiator(vector: Vector): NoiseSession {
  const psk = vector.init_psks?.[0];
  return NoiseSession.start({
    handshake: handshakes[vector.protocol_name] ?? "pairing",
    role: "initiator",
    localPrivateKey: fromHex(vector.init_static),
    ...(psk === undefined ? {} : { psk: fromHex(psk) }),
    ...(vector.init_remote_static === undefined
      ? {}
      : { remotePublicKey: fromHex(vector.init_remote_static) }),
    prologue: fromHex(vector.init_prologue),
    randomFill: fixedRandom(fromHex(vector.init_ephemeral)),
  });
}

function startResponder(vector: Vector): NoiseSession {
  const psk = vector.resp_psks?.[0];
  return NoiseSession.start({
    handshake: handshakes[vector.protocol_name] ?? "pairing",
    role: "responder",
    localPrivateKey: fromHex(vector.resp_static),
    ...(psk === undefined ? {} : { psk: fromHex(psk) }),
    prologue: fromHex(vector.resp_prologue),
    randomFill: fixedRandom(fromHex(vector.resp_ephemeral)),
  });
}

verifies("e2e-noise.published-vectors", () => {
  it("has every published vector for our two handshakes", () => {
    expect(vectors.map((vector) => `${vector.source} ${vector.protocol_name}`)).toEqual([
      "cacophony Noise_IK_25519_ChaChaPoly_SHA256",
      "cacophony Noise_XXpsk3_25519_ChaChaPoly_SHA256",
      "snow Noise_IK_25519_ChaChaPoly_SHA256",
    ]);
  });

  it.each(vectors.map((vector) => [`${vector.source} ${vector.protocol_name}`, vector] as const))(
    "writes and reads every message of %s byte for byte",
    (_name, vector) => {
      const initiator = startInitiator(vector);
      const responder = startResponder(vector);
      vector.messages.forEach((message, index) => {
        const [sender, reader] = index % 2 === 0 ? [initiator, responder] : [responder, initiator];
        const written = sender.writeMessage(fromHex(message.payload));
        expect(toHex(written), `message ${index}`).toBe(message.ciphertext);
        expect(toHex(reader.readMessage(written)), `payload ${index}`).toBe(message.payload);
      });
      expect(initiator.isTransport && responder.isTransport).toBe(true);
      const hash = toHex(initiator.handshakeHash());
      expect(toHex(responder.handshakeHash())).toBe(hash);
      if (vector.handshake_hash !== undefined) expect(hash).toBe(vector.handshake_hash);
      initiator.end();
      responder.end();
    },
  );
});
