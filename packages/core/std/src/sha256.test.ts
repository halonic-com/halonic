import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bytesToHex } from "./hex.ts";
import { sha256, sha256Hex } from "./sha256.ts";
import { SeededRandom } from "./test/seeded-random.ts";

// FIPS 180-2, appendix B, and the NIST CSRC examples for SHA-256.
const nistVectors: ReadonlyArray<readonly [string, string]> = [
  ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
  ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
  [
    "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  ],
  [
    "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu",
    "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1",
  ],
];

describe("std.sha256", () => {
  it.each(nistVectors)("hashes the NIST vector %j", (message, digest) => {
    expect(sha256Hex(message)).toBe(digest);
  });

  it("hashes one million times 'a' (NIST)", () => {
    expect(sha256Hex("a".repeat(1_000_000))).toBe(
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    );
  });

  it("returns 32 bytes, the same as the hex form", () => {
    const digest = sha256("abc");
    expect(digest).toHaveLength(32);
    expect(bytesToHex(digest)).toBe(sha256Hex("abc"));
  });

  it("hashes text as UTF-8", () => {
    expect(sha256Hex("héllo 😀")).toBe(createHash("sha256").update("héllo 😀").digest("hex"));
  });

  it("matches node:crypto for every length around the block and padding edges", () => {
    const random = new SeededRandom(3);
    for (let length = 0; length <= 200; length++) {
      const message = random.bytes(length);
      expect(sha256Hex(message), `length ${length}`).toBe(
        createHash("sha256").update(message).digest("hex"),
      );
    }
  });

  it("matches node:crypto on a view into a larger buffer", () => {
    const buffer = new SeededRandom(5).bytes(100);
    const view = buffer.subarray(10, 75);
    expect(sha256Hex(view)).toBe(createHash("sha256").update(view).digest("hex"));
  });
});
