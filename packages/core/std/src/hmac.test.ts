import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bytesToHex } from "./hex.ts";
import { hmacSha256 } from "./hmac.ts";
import { SeededRandom } from "./test/seeded-random.ts";

const repeated = (byte: number, count: number) => new Uint8Array(count).fill(byte);

// RFC 4231, section 4. Test case 5 checks truncated output, which we don't offer.
const rfc4231Vectors: ReadonlyArray<
  readonly [string, Uint8Array | string, Uint8Array | string, string]
> = [
  [
    "test case 1",
    repeated(0x0b, 20),
    "Hi There",
    "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
  ],
  [
    "test case 2",
    "Jefe",
    "what do ya want for nothing?",
    "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
  ],
  [
    "test case 3",
    repeated(0xaa, 20),
    repeated(0xdd, 50),
    "773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe",
  ],
  [
    "test case 4",
    Uint8Array.from({ length: 25 }, (_, index) => index + 1),
    repeated(0xcd, 50),
    "82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b",
  ],
  [
    "test case 6",
    repeated(0xaa, 131),
    "Test Using Larger Than Block-Size Key - Hash Key First",
    "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54",
  ],
  [
    "test case 7",
    repeated(0xaa, 131),
    "This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.",
    "9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2",
  ],
];

describe("std.hmac-sha256", () => {
  it.each(rfc4231Vectors)("matches RFC 4231 %s", (_, key, message, expected) => {
    expect(bytesToHex(hmacSha256(key, message))).toBe(expected);
  });

  it("matches node:crypto for keys shorter than, equal to and longer than a block", () => {
    const random = new SeededRandom(9);
    for (const keyLength of [0, 1, 32, 63, 64, 65, 200]) {
      const key = random.bytes(keyLength);
      const message = random.bytes(random.below(150));
      expect(bytesToHex(hmacSha256(key, message)), `key length ${keyLength}`).toBe(
        createHmac("sha256", key).update(message).digest("hex"),
      );
    }
  });
});
