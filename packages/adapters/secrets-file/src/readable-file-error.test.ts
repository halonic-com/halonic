import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ReadableSecretsFileError } from "./readable-file-error.ts";

verifies("secrets-file.private", () => {
  describe("the fix a readable secrets file gets", () => {
    it("names the file as it is when it needs no quotes", () => {
      const error = new ReadableSecretsFileError("/profile/secrets/secrets.json");
      expect(error.fix).toBe("Run chmod 600 /profile/secrets/secrets.json, then run again.");
    });

    it("quotes a file with a space, so the command can be pasted (HAL-15483)", () => {
      // Every macOS profile is under ~/Library/Application Support; this stands for it.
      const file = "/profile/Application Support/halonic/secrets/secrets.json";
      const error = new ReadableSecretsFileError(file);
      expect(error.fix).toBe(`Run chmod 600 "${file}", then run again.`);
      expect(error.failureCause.detail.file).toBe(file);
    });
  });
});
