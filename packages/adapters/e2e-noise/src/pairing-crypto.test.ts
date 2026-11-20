import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pairCommitInput } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { checkCode, pairCommit, pairingPsk, sameBytes } from "./pairing-crypto.ts";
import { fromHex, toHex } from "./session.test-helper.ts";

/** B0's vectors, which the phone checks itself against too. */
const vectors: {
  readonly pairingCodes: readonly { readonly code: string; readonly psk: string }[];
  readonly checkCodes: readonly { readonly handshakeHash: string; readonly checkCode: string }[];
} = JSON.parse(
  readFileSync(
    new URL("../../../core/ports/src/golden/pairing-vectors.json", import.meta.url),
    "utf8",
  ),
);

verifies("e2e-noise.pairing-derivations", () => {
  it("gives every pairing code vector's psk", () => {
    expect(vectors.pairingCodes.length).toBeGreaterThan(0);
    for (const vector of vectors.pairingCodes) {
      expect(toHex(pairingPsk(vector.code)), vector.code).toBe(vector.psk);
    }
  });

  it("gives every check code vector's check code", () => {
    // The vectors without a handshake hash only test turning HKDF bytes into
    // letters, which the ports package checks.
    const fromHashes = vectors.checkCodes.filter((vector) => vector.handshakeHash !== "");
    expect(fromHashes.length).toBeGreaterThan(0);
    for (const vector of fromHashes) {
      expect(checkCode(fromHex(vector.handshakeHash))).toBe(vector.checkCode);
    }
  });

  it("refuses a pairing code that isn't one", () => {
    expect(() => pairingPsk("not a code")).toThrow(RangeError);
  });

  it("commits to the phone's key and message 3 with SHA-256, in base64url", () => {
    const key = new Uint8Array(32).fill(9);
    const payload = new TextEncoder().encode('{"name":"Phone","platform":"android","nonce":"x"}');
    const expected = createHash("sha256").update(pairCommitInput(key, payload)).digest();
    const commit = pairCommit(key, payload);
    expect(commit).toHaveLength(43);
    expect(Buffer.from(commit, "base64url")).toEqual(expected);
  });

  it("compares bytes of any length without throwing", () => {
    expect(sameBytes(fromHex("0102"), fromHex("0102"))).toBe(true);
    expect(sameBytes(fromHex("0102"), fromHex("0103"))).toBe(false);
    expect(sameBytes(fromHex("0102"), fromHex("01"))).toBe(false);
  });
});
