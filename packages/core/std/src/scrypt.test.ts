import { scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bytesToHex } from "./hex.ts";
import { type ScryptSettings, scrypt } from "./scrypt.ts";
import { SeededRandom } from "./test/seeded-random.ts";

const settings = (
  cost: number,
  blockSize: number,
  parallelization: number,
  keyLength = 64,
): ScryptSettings => ({ cost, blockSize, parallelization, keyLength });

// The large vectors take 0.3 to 1.5 s each, and several times that under
// coverage. A fixed, generous limit keeps them from failing on a slow machine.
const slowVectorTimeoutMs = 30_000;

describe("std.scrypt", () => {
  // RFC 7914, section 12. The fourth vector (N = 2^20) needs 1 GiB and is
  // left out; the oracle test below covers the same code with smaller N.
  it("matches the RFC 7914 vector with an empty password and salt", () => {
    expect(bytesToHex(scrypt("", "", settings(16, 1, 1)))).toBe(
      "77d6576238657b203b19ca42c18a0497f16b4844e3074ae8dfdffa3fede21442fcd0069ded0948f8326a753a0fc81f17e8d3e0fb2e0d3628cf35e20c38d18906",
    );
  });

  it(
    "matches the RFC 7914 vector with N = 1024, r = 8, p = 16",
    () => {
      expect(bytesToHex(scrypt("password", "NaCl", settings(1024, 8, 16)))).toBe(
        "fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b3731622eaf30d92e22a3886ff109279d9830dac727afb94a83ee6d8360cbdfa2cc0640",
      );
    },
    slowVectorTimeoutMs,
  );

  it(
    "matches the RFC 7914 vector with N = 16384, r = 8, p = 1",
    () => {
      expect(bytesToHex(scrypt("pleaseletmein", "SodiumChloride", settings(16384, 8, 1)))).toBe(
        "7023bdcb3afd7348461c06cd81fd38ebfda8fbba904f8e3ea9b543f6545da1f2d5432955613f0fcf62d49705242a9af9e61e85dc0d651e40dfcf017b45575887",
      );
    },
    slowVectorTimeoutMs,
  );

  it("matches node:crypto on generated passwords, salts and settings", () => {
    const random = new SeededRandom(17);
    for (let round = 0; round < 12; round++) {
      const password = random.bytes(random.below(30));
      const salt = random.bytes(random.below(30));
      const cost = 2 ** (1 + random.below(8));
      const blockSize = 1 + random.below(4);
      const parallelization = 1 + random.below(3);
      const keyLength = 1 + random.below(80);
      const expected = scryptSync(password, salt, keyLength, {
        N: cost,
        r: blockSize,
        p: parallelization,
      }).toString("hex");
      const actual = bytesToHex(
        scrypt(password, salt, settings(cost, blockSize, parallelization, keyLength)),
      );
      expect(actual, `N=${cost} r=${blockSize} p=${parallelization}`).toBe(expected);
    }
  });

  it(
    "matches node:crypto with the settings from the multi-cloud ADR",
    () => {
      const adrSettings = settings(2 ** 14, 8, 5, 32);
      const expected = scryptSync("correct horse battery staple", "pepper-free salt", 32, {
        N: 2 ** 14,
        r: 8,
        p: 5,
      }).toString("hex");
      expect(
        bytesToHex(scrypt("correct horse battery staple", "pepper-free salt", adrSettings)),
      ).toBe(expected);
    },
    slowVectorTimeoutMs,
  );

  it("accepts a view into a larger buffer as password and salt", () => {
    const buffer = new SeededRandom(19).bytes(64);
    const password = buffer.subarray(3, 20);
    const salt = buffer.subarray(30, 47);
    expect(bytesToHex(scrypt(password, salt, settings(16, 2, 1, 32)))).toBe(
      scryptSync(password, salt, 32, { N: 16, r: 2, p: 1 }).toString("hex"),
    );
  });
});

describe("std.scrypt-settings", () => {
  it.each([
    ["a cost of 1", settings(1, 1, 1), /cost \(N\) must be a power of two/],
    ["a cost that isn't a power of two", settings(1000, 8, 1), /cost \(N\)/],
    ["a cost above 2^30", settings(2 ** 31, 8, 1), /cost \(N\)/],
    ["a block size of 0", settings(16, 0, 1), /blockSize \(r\)/],
    ["a fractional block size", settings(16, 1.5, 1), /blockSize \(r\)/],
    ["a parallelization of 0", settings(16, 1, 0), /parallelization \(p\)/],
    ["r x p of 2^30", settings(16, 2 ** 15, 2 ** 15), /below 2\^30/],
    ["N at 2^(16 r)", settings(2 ** 16, 1, 1), /below 2\^\(16 x blockSize\)/],
    ["a key length of 0", settings(16, 1, 1, 0), /keyLength/],
  ])("refuses %s", (_, badSettings, message) => {
    expect(() => scrypt("p", "s", badSettings)).toThrow(RangeError);
    expect(() => scrypt("p", "s", badSettings)).toThrow(message);
  });

  it("refuses settings that need more memory than the limit", () => {
    expect(() => scrypt("p", "s", settings(2 ** 16, 8, 1))).toThrow(
      /needs 67108864 bytes .* limit of 33554432/,
    );
    expect(() => scrypt("p", "s", { ...settings(1024, 8, 1), maxMemoryBytes: 1024 })).toThrow(
      /limit of 1024/,
    );
  });

  it("allows settings exactly at the memory limit", () => {
    const atLimit = { ...settings(16, 1, 1, 16), maxMemoryBytes: 128 * 16 };
    expect(scrypt("p", "s", atLimit)).toHaveLength(16);
  });
});
