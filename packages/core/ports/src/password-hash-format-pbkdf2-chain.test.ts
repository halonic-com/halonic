import { pbkdf2Sync } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

// The ports package has no hasher; the `password-hasher` contract suite runs
// these vectors against every chained PBKDF2 adapter. This test proves the
// vectors in the requirement are right, by recomputing them with Node's own
// PBKDF2 (OpenSSL), which shares no code with the WebCrypto adapters.

const requirement = readFileSync(
  fileURLToPath(new URL("../requirements/password-hash-format-pbkdf2-chain.md", import.meta.url)),
  "utf8",
);

// "pässwörd für halonic" typed two ways, built from code points so the
// difference stays visible: each umlaut as one character, and as the vowel
// plus a combining diaeresis (U+0308).
const umlaut = String.fromCodePoint(0x308);
const composedPassword = `p${String.fromCodePoint(0xe4)}ssw${String.fromCodePoint(0xf6)}rd f${String.fromCodePoint(0xfc)}r halonic`;
const decomposedPassword = `pa${umlaut}sswo${umlaut}rd fu${umlaut}r halonic`;

const vectors = [
  {
    password: "correct horse battery staple",
    hash: "$pbkdf2-sha256-chain$i=100000,n=6$AAECAwQFBgcICQoLDA0ODw$rfDFKdlz6hQsDnqes4jawGjfp+mn20j77PR84Xj0KfE",
  },
  {
    password: decomposedPassword,
    hash: "$pbkdf2-sha256-chain$i=100000,n=6$AAECAwQFBgcICQoLDA0ODw$ZxsiFH9QDVVYBRBEH1XLiBBMY48mu5N51MaOKGYfrNI",
  },
  {
    password: "correct horse battery staple",
    hash: "$pbkdf2-sha256-chain$i=100000,n=7$AAECAwQFBgcICQoLDA0ODw$EDbbXUxT44YDF0NbM0rrUM1/M3pBYo7Vh+dtc81qGUA",
  },
];

const format = /^\$pbkdf2-sha256-chain\$i=(\d+),n=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/** Runs PBKDF2-HMAC-SHA256 `runs` times, each run's output being the next run's password. */
function chain(password: string, salt: Buffer, rounds: number, runs: number): Buffer {
  let key = Buffer.from(password.normalize("NFC"), "utf8");
  for (let run = 0; run < runs; run++) {
    key = pbkdf2Sync(key, salt, rounds, 32, "sha256");
  }
  return key;
}

/** Recomputes a hash from the password, using the hash's own salt and settings. */
function recompute(
  password: string,
  hash: string,
): { salt: Buffer; key: Buffer; expected: Buffer } {
  const [, rounds, runs, salt64, hash64] = format.exec(hash) ?? [];
  if (salt64 === undefined || hash64 === undefined) throw new Error(`not in the format: ${hash}`);
  const salt = Buffer.from(salt64, "base64");
  const expected = Buffer.from(hash64, "base64");
  return { salt, key: chain(password, salt, Number(rounds), Number(runs)), expected };
}

verifies("ports.password-hash-format-pbkdf2-chain", () => {
  for (const { password, hash } of vectors) {
    it(`matches Node's PBKDF2 for ${JSON.stringify(password)} in ${hash.split("$")[2]}`, () => {
      const { salt, key, expected } = recompute(password, hash);
      expect([...salt]).toEqual([...Array(16).keys()]);
      expect(expected).toHaveLength(32);
      expect(key.equals(expected)).toBe(true);
      expect(requirement).toContain(hash);
    });
  }

  it("normalises to NFC, so both ways of typing the umlauts give the same hash", () => {
    const composed = recompute(composedPassword, vectors[1]?.hash ?? "");
    expect(composed.key.equals(composed.expected)).toBe(true);
  });

  it("gives a different hash for a wrong password", () => {
    const { key, expected } = recompute("correct horse battery stapler", vectors[0]?.hash ?? "");
    expect(key.equals(expected)).toBe(false);
  });

  it("gives the single-run values the requirement quotes", () => {
    const rfc7914 = pbkdf2Sync("password", "salt", 4096, 32, "sha256").toString("hex");
    const oneRun = chain(
      "correct horse battery staple",
      Buffer.from([...Array(16).keys()]),
      100_000,
      1,
    );
    expect(rfc7914).toBe("c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a");
    expect(oneRun.toString("hex")).toBe(
      "49d49c25f597846209f0d92e7770ab64e1c75e94b4ce6c509265ee67175d2a1e",
    );
    expect(requirement).toContain(rfc7914);
    expect(requirement).toContain(oneRun.toString("hex"));
  });
});
