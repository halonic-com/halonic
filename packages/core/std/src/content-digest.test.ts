import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { contentDigest, matchesExpected, type Sha256 } from "./content-digest.ts";

const digest: Sha256 = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

verifies("std.content-digest", () => {
  describe("contentDigest", () => {
    it("is sha256: and the 64 hex characters of the text's UTF-8 bytes", async () => {
      expect(await contentDigest("hello", digest)).toBe(
        "sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      );
      expect(await contentDigest("", digest)).toBe(
        "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
    });

    it("hashes the UTF-8 bytes, not the UTF-16 code units", async () => {
      expect(await contentDigest("\u00e9", digest)).toBe(
        "sha256:4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c",
      );
    });
  });

  describe("matchesExpected", () => {
    it("matches a file that still holds the text last read", async () => {
      const one = await contentDigest("1", digest);
      expect(await matchesExpected("1", one, digest)).toBe(true);
      expect(await matchesExpected("3", one, digest)).toBe(false);
    });

    it("matches `absent` only when there is no file", async () => {
      expect(await matchesExpected(null, "absent", digest)).toBe(true);
      expect(await matchesExpected("", "absent", digest)).toBe(false);
      expect(await matchesExpected("1", "absent", digest)).toBe(false);
    });

    it("doesn't match a digest when the file is gone", async () => {
      expect(await matchesExpected(null, await contentDigest("1", digest), digest)).toBe(false);
    });
  });
});
