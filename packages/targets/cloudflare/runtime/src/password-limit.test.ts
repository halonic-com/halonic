import { createPbkdf2ChainHasher } from "@halonicjs/adapter-password-pbkdf2";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { limitPasswordLength, maximumPasswordBytes } from "./password-limit.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

const hasher = limitPasswordLength(createPbkdf2ChainHasher());

verifies("runtime.password-limit", () => {
  describe("the password limit", () => {
    it("answers false for a password over 1,024 bytes, with no PBKDF2 work", async () => {
      const stored = await hasher.hash("a long made-up password");
      const deriveBits = vi.spyOn(crypto.subtle, "deriveBits");
      expect(await hasher.verify("x".repeat(maximumPasswordBytes + 1), stored)).toBe(false);
      expect(deriveBits).not.toHaveBeenCalled();
    });

    it("refuses to hash a password over 1,024 bytes, with no PBKDF2 work", () => {
      const deriveBits = vi.spyOn(crypto.subtle, "deriveBits");
      expect(() => hasher.hash("x".repeat(maximumPasswordBytes + 1))).toThrow(RangeError);
      expect(deriveBits).not.toHaveBeenCalled();
    });

    it("counts bytes, not characters", async () => {
      const stored = await hasher.hash("a long made-up password");
      const deriveBits = vi.spyOn(crypto.subtle, "deriveBits");
      // 513 characters of two bytes each are 1,026 bytes.
      expect(await hasher.verify("é".repeat(513), stored)).toBe(false);
      expect(deriveBits).not.toHaveBeenCalled();
    });

    it("lets a password of exactly 1,024 bytes through to the hasher", async () => {
      const password = "x".repeat(maximumPasswordBytes);
      const stored = await hasher.hash(password);
      const deriveBits = vi.spyOn(crypto.subtle, "deriveBits");
      expect(await hasher.verify(password, stored)).toBe(true);
      expect(deriveBits).toHaveBeenCalled();
    });

    it("measures the password as the hasher reads it, in NFC", async () => {
      // 1,200 bytes as typed (e and a combining accent), 800 once composed.
      const password = "é".repeat(400);
      const stored = await hasher.hash(password);
      expect(await hasher.verify(password, stored)).toBe(true);
    });

    it("leaves needsRehash to the hasher", async () => {
      expect(hasher.needsRehash(await hasher.hash("a long made-up password"))).toBe(false);
    });
  });
});
