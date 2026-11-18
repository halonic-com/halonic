import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type NoiseHandshake, NoiseSession, type NoiseRole } from "./noise-session.ts";
import { checkCode } from "./pairing-crypto.ts";
import { fixedRandom, fromHex, toHex } from "./session.test-helper.ts";

/**
 * Both handshakes with fixed keys and ephemeral keys, written once by this
 * package's `noise.wasm`. The crate's `tests/transcript.rs` checks that plain
 * `snow`, built natively as on the phone, writes and reads the same bytes.
 */
interface Transcript {
  readonly sessions: readonly {
    readonly name: NoiseHandshake;
    readonly protocolName: string;
    readonly prologue: string;
    readonly psk?: string;
    readonly initiator: Party;
    readonly responder: Party;
    readonly handshakeHash: string;
    readonly checkCode?: string;
    readonly steps: readonly Step[];
  }[];
}

interface Party {
  readonly private: string;
  readonly public: string;
  readonly ephemeral: string;
}

type Step =
  | { readonly from: NoiseRole; readonly payload: string; readonly message: string }
  | { readonly rekey: NoiseRole };

const transcript: Transcript = JSON.parse(
  readFileSync(new URL("./test/transcript.json", import.meta.url), "utf8"),
);

const sides: readonly NoiseRole[] = ["initiator", "responder"];

verifies("e2e-noise.same-as-snow", () => {
  it("has both handshakes", () => {
    expect(transcript.sessions.map((session) => session.name)).toEqual(["pairing", "reconnect"]);
  });

  for (const session of transcript.sessions) {
    it.each(sides)(`plays the %s of the ${session.name} transcript byte for byte`, (role) => {
      const party = session[role];
      const other = role === "initiator" ? session.responder : session.initiator;
      const pinned = session.name === "reconnect" && role === "initiator";
      const noise = NoiseSession.start({
        handshake: session.name,
        role,
        localPrivateKey: fromHex(party.private),
        ...(session.psk === undefined ? {} : { psk: fromHex(session.psk) }),
        ...(pinned ? { remotePublicKey: fromHex(other.public) } : {}),
        prologue: fromHex(session.prologue),
        randomFill: fixedRandom(fromHex(party.ephemeral)),
      });
      session.steps.forEach((step, index) => {
        if ("rekey" in step) {
          if (step.rekey === role) noise.rekeyOutgoing();
          else noise.rekeyIncoming();
        } else if (step.from === role) {
          expect(toHex(noise.writeMessage(fromHex(step.payload))), `step ${index}`).toBe(
            step.message,
          );
        } else {
          expect(toHex(noise.readMessage(fromHex(step.message))), `step ${index}`).toBe(
            step.payload,
          );
        }
      });
      expect(toHex(noise.handshakeHash())).toBe(session.handshakeHash);
      expect(toHex(noise.remoteStaticKey())).toBe(other.public);
      if (session.checkCode !== undefined) {
        expect(checkCode(noise.handshakeHash())).toBe(session.checkCode);
      }
      noise.end();
    });
  }
});
