import { scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The ports package has no hasher; the `password-hasher` contract suite runs
// these vectors against every adapter. This test proves the vectors in the
// requirement are right, by recomputing them with Node's own scrypt
// (OpenSSL), which shares no code with `core/std`.

const requirement = readFileSync(
  fileURLToPath(new URL("../requirements/password-hash-format.md", import.meta.url)),
  "utf8",
);

// "Café" typed two ways, built from code points so the difference stays
// visible: é as one character (U+00E9), and e plus a combining accent (U+0301).
const composedCafe = `Caf${String.fromCodePoint(0xe9)}`;
const decomposedCafe = `Cafe${String.fromCodePoint(0x301)}`;

const vectors = [
  {
    password: "correct horse battery staple",
    hash: "$scrypt$ln=14,r=8,p=5$AAECAwQFBgcICQoLDA0ODw$D7lSJtJDGLLVcrxL7dWjkoRxbs+pMvcVYIJ+gbuyltk",
  },
  {
    password: decomposedCafe,
    hash: "$scrypt$ln=14,r=8,p=5$AAECAwQFBgcICQoLDA0ODw$uTLaEKfxixfKWAEXnGRbMwK/H3yGuy+bJGUxguLKks0",
  },
];

const format = /^\$scrypt\$ln=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/** Recomputes a hash's key from the password, using the hash's own salt and settings. */
function recompute(
  password: string,
  hash: string,
): { salt: Buffer; key: Buffer; expected: Buffer } {
  const [, ln, r, p, salt64, key64] = format.exec(hash) ?? [];
  if (salt64 === undefined || key64 === undefined) throw new Error(`not in the format: ${hash}`);
  const salt = Buffer.from(salt64, "base64");
  const expected = Buffer.from(key64, "base64");
  const key = scryptSync(Buffer.from(password.normalize("NFC"), "utf8"), salt, expected.length, {
    N: 2 ** Number(ln),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return { salt, key, expected };
}

describe("ports.password-hash-format", () => {
  for (const { password, hash } of vectors) {
    it(`matches Node's scrypt for ${JSON.stringify(password)}`, () => {
      const { salt, key, expected } = recompute(password, hash);
      expect([...salt]).toEqual([...Array(16).keys()]);
      expect(expected).toHaveLength(32);
      expect(key.equals(expected)).toBe(true);
      expect(requirement).toContain(hash);
    });
  }

  it("normalises to NFC, so both ways of typing é give the same key", () => {
    const composed = recompute(composedCafe, vectors[1]?.hash ?? "");
    expect(composed.key.equals(composed.expected)).toBe(true);
  });

  it("gives a different key for a wrong password", () => {
    const { key, expected } = recompute("correct horse battery stapler", vectors[0]?.hash ?? "");
    expect(key.equals(expected)).toBe(false);
  });
});
