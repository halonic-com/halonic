import { pbkdf2Sync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bytesToHex } from "./hex.ts";
import { pbkdf2Sha256 } from "./pbkdf2.ts";
import { SeededRandom } from "./test/seeded-random.ts";
import { encodeUtf8 } from "./utf8.ts";

// The 80,000-iteration vector takes about 2 s, and several times that under
// coverage. A fixed, generous limit keeps it from failing on a slow machine.
const slowVectorTimeoutMs = 30_000;

describe("std.pbkdf2-sha256", () => {
  // RFC 7914, section 11.
  it("matches the RFC 7914 vector with one iteration", () => {
    const key = pbkdf2Sha256(encodeUtf8("passwd"), encodeUtf8("salt"), 1, 64);
    expect(bytesToHex(key)).toBe(
      "55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783",
    );
  });

  it(
    "matches the RFC 7914 vector with 80,000 iterations",
    () => {
      const key = pbkdf2Sha256(encodeUtf8("Password"), encodeUtf8("NaCl"), 80_000, 64);
      expect(bytesToHex(key)).toBe(
        "4ddcd8f60b98be21830cee5ef22701f9641a4418d04c0414aeff08876b34ab56a1d425a1225833549adb841b51c9b3176a272bdebba1d078478f62b397f33c8d",
      );
    },
    slowVectorTimeoutMs,
  );

  it("matches node:crypto for key lengths that end inside and on a 32-byte block", () => {
    const random = new SeededRandom(13);
    for (const keyLength of [1, 31, 32, 33, 64, 100]) {
      const password = random.bytes(random.below(40));
      const salt = random.bytes(random.below(40));
      const iterations = 1 + random.below(5);
      expect(
        bytesToHex(pbkdf2Sha256(password, salt, iterations, keyLength)),
        `key length ${keyLength}`,
      ).toBe(pbkdf2Sync(password, salt, iterations, keyLength, "sha256").toString("hex"));
    }
  });
});
