import type { Digest } from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type IntegrationFile, integrationCodeDigest } from "./trust-integration-code.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

function file(path: string, text: string): IntegrationFile {
  return { path, bytes: encodeUtf8(text) };
}

const index = file("index.js", "export default {};\n");
const helper = file("src/helper.js", "export const one = 1;\n");

verifies("workspace.trust-integration-code", () => {
  describe("the hash", () => {
    it("is sha256: and 64 hex characters", async () => {
      expect(await integrationCodeDigest([index], digest)).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it("is the same whatever order the files come in, and from an async reader", async () => {
      async function* reader() {
        yield helper;
        yield index;
      }
      const inOrder = await integrationCodeDigest([index, helper], digest);
      expect(await integrationCodeDigest([helper, index], digest)).toBe(inOrder);
      expect(await integrationCodeDigest(reader(), digest)).toBe(inOrder);
    });

    it.each([
      ["one byte of a file changes", [file("index.js", "export default {};\r"), helper]],
      ["a file is renamed", [file("main.js", "export default {};\n"), helper]],
      ["a file moves to another folder", [file("lib/index.js", "export default {};\n"), helper]],
      ["an empty file is added", [index, helper, file("notes.txt", "")]],
      ["a file is removed", [index]],
    ])("changes when %s", async (_, files) => {
      const before = await integrationCodeDigest([index, helper], digest);
      expect(await integrationCodeDigest(files, digest)).not.toBe(before);
    });

    it("keeps a path and its content apart, so moving bytes between them changes it", async () => {
      const one = await integrationCodeDigest([file("ab", "c")], digest);
      expect(await integrationCodeDigest([file("a", "bc")], digest)).not.toBe(one);
    });
  });

  describe("the paths", () => {
    it.each([
      "/etc/passwd",
      "../outside.js",
      "src/../index.js",
      "./index.js",
      "src\\index.js",
      "src//index.js",
      "",
      "C:/index.js",
      "C:",
      "src/a:b.js",
      "index.js\u0000.txt",
      "src/\nindex.js",
      "index.js.",
      "index.js ",
    ])("refuses %j", async (path) => {
      await expect(integrationCodeDigest([file(path, "")], digest)).rejects.toThrow(RangeError);
    });

    it("refuses two files with the same path", async () => {
      await expect(integrationCodeDigest([index, index], digest)).rejects.toThrow(
        'Two files have the path "index.js".',
      );
    });
  });
});
