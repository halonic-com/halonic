import { scryptSync } from "node:crypto";
import { scryptFormat } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { expect, it, vi } from "vitest";
import { createScryptHasher } from "./scrypt-hasher.ts";

// Wraps the real scrypt, so a test can count the calls.
vi.mock("@noble/hashes/scrypt.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@noble/hashes/scrypt.js")>();
  return { ...original, scryptAsync: vi.fn(original.scryptAsync) };
});

verifies("password-scrypt.no-work-before-refusal", () => {
  it("refuses a broken hash before any scrypt work starts", async () => {
    vi.mocked(scryptAsync).mockClear();
    const hasher = createScryptHasher();
    const broken = [
      ...scryptFormat.outOfRange,
      ...scryptFormat.malformed,
      ...scryptFormat.otherFormats,
    ];
    for (const hash of broken) {
      await expect(hasher.verify("any password", hash), hash).rejects.toThrow(RangeError);
    }
    expect(scryptAsync).not.toHaveBeenCalled();
  });

  it("never repeats the hash text in its errors", async () => {
    const hash = scryptFormat.malformed[0] ?? "";
    const error = await createScryptHasher()
      .verify("any password", hash)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RangeError);
    expect(String(error)).not.toContain(hash.split("$")[3]);
  });
});

verifies("password-scrypt.matches-openssl", () => {
  it("makes the key Node's scrypt (OpenSSL) makes, for the vectors the contract uses", async () => {
    const hasher = createScryptHasher();
    for (const { password, hash } of [...scryptFormat.matching, scryptFormat.olderSettings]) {
      const [, , settings, salt, key] = hash.split("$");
      const [ln, r, p] = (settings ?? "").split(",").map((part) => Number(part.split("=")[1]));
      const expected = scryptSync(
        password.normalize("NFC"),
        Buffer.from(salt ?? "", "base64"),
        32,
        { N: 2 ** (ln ?? 0), r, p, maxmem: 64 * 1024 * 1024 },
      );
      expect(expected.toString("base64").replace(/=+$/, "")).toBe(key);
      expect(await hasher.verify(password, hash)).toBe(true);
    }
  });
});
