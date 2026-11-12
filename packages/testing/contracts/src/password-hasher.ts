import type { PasswordHasher } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { PasswordHashFormatCases } from "./password-hash-formats.ts";

/** Creates the hasher under test. */
export type MakePasswordHasher = () => Promise<PasswordHasher>;

/**
 * The contract every {@link PasswordHasher} adapter passes, with the cases of
 * the one format it makes (each adapter makes exactly one).
 */
export function passwordHasherContract(
  name: string,
  make: MakePasswordHasher,
  format: PasswordHashFormatCases,
): void {
  behaviourCases(name, make, format);
  formatCases(name, make, format);
}

/** What every adapter does, whatever its format. */
function behaviourCases(
  name: string,
  make: MakePasswordHasher,
  format: PasswordHashFormatCases,
): void {
  verifies("contracts.password-hasher", () => {
    describe(`PasswordHasher contract: ${name}`, () => {
      it("verifies a new hash with the password, and only with it", async () => {
        const hasher = await make();
        const stored = await hasher.hash("a long made-up password");
        expect(stored).toMatch(format.newHash);
        expect(hasher.needsRehash(stored)).toBe(false);
        expect(await hasher.verify("a long made-up password", stored)).toBe(true);
        expect(await hasher.verify("a long made-up passwort", stored)).toBe(false);
      });

      it("gives each hash its own salt", async () => {
        const hasher = await make();
        const first = await hasher.hash("same password");
        const second = await hasher.hash("same password");
        expect(first).not.toBe(second);
      });

      it("refuses another format, or text that isn't a hash, with a RangeError", async () => {
        const hasher = await make();
        for (const hash of format.otherFormats) {
          await expect(hasher.verify("any password", hash), hash).rejects.toThrow(RangeError);
          expect(() => hasher.needsRehash(hash), hash).toThrow(RangeError);
        }
      });
    });
  });
}

/** The vectors, ranges and malformed hashes of the adapter's one format. */
function formatCases(
  name: string,
  make: MakePasswordHasher,
  format: PasswordHashFormatCases,
): void {
  verifies(format.requirement, () => {
    describe(`PasswordHasher format vectors: ${name}`, () => {
      for (const { password, hash } of format.matching) {
        it(`verifies the vector for ${JSON.stringify(password)}`, async () => {
          const hasher = await make();
          expect(await hasher.verify(password, hash)).toBe(true);
          expect(hasher.needsRehash(hash)).toBe(false);
        });
      }

      it("gives false for a wrong password", async () => {
        const hasher = await make();
        const { password, hash } = format.wrongPassword;
        expect(await hasher.verify(password, hash)).toBe(false);
      });

      it("verifies a hash with older settings in range, and says it needs a rehash", async () => {
        const hasher = await make();
        const { password, hash } = format.olderSettings;
        expect(await hasher.verify(password, hash)).toBe(true);
        expect(hasher.needsRehash(hash)).toBe(true);
      });

      it("refuses settings out of range with a RangeError", async () => {
        const hasher = await make();
        for (const hash of format.outOfRange) {
          await expect(hasher.verify("any password", hash), hash).rejects.toThrow(/out of range/);
          expect(() => hasher.needsRehash(hash), hash).toThrow(RangeError);
        }
      });

      it("refuses a malformed hash with a RangeError", async () => {
        const hasher = await make();
        for (const hash of format.malformed) {
          await expect(hasher.verify("any password", hash), hash).rejects.toThrow(/malformed/);
          expect(() => hasher.needsRehash(hash), hash).toThrow(RangeError);
        }
      });
    });
  });
}
