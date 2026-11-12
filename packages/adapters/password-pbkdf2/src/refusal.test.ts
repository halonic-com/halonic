import { pbkdf2ChainFormat } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { createPbkdf2ChainHasher } from "./pbkdf2-chain-hasher.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

verifies("password-pbkdf2.no-work-before-refusal", () => {
  it("refuses a broken hash before any PBKDF2 work starts", async () => {
    const deriveBits = vi.spyOn(crypto.subtle, "deriveBits");
    const hasher = createPbkdf2ChainHasher();
    const broken = [
      ...pbkdf2ChainFormat.outOfRange,
      ...pbkdf2ChainFormat.malformed,
      ...pbkdf2ChainFormat.otherFormats,
    ];
    for (const hash of broken) {
      await expect(hasher.verify("any password", hash), hash).rejects.toThrow(RangeError);
    }
    expect(deriveBits).not.toHaveBeenCalled();
  });

  it("runs PBKDF2 once per run of the stored hash", async () => {
    const deriveBits = vi.spyOn(crypto.subtle, "deriveBits");
    const { password, hash } = pbkdf2ChainFormat.olderSettings;
    expect(await createPbkdf2ChainHasher().verify(password, hash)).toBe(true);
    expect(deriveBits).toHaveBeenCalledTimes(7);
  });

  it("never repeats the hash text in its errors", async () => {
    const hash = pbkdf2ChainFormat.malformed[0] ?? "";
    const error = await createPbkdf2ChainHasher()
      .verify("any password", hash)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RangeError);
    expect(String(error)).not.toContain(hash.split("$")[3]);
  });
});
