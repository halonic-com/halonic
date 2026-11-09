import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { describeSecretName, isSecretName, maxSecretNameLength, secretKey } from "./index.ts";

// The contract suite runs the rule through every adapter; this checks the shared helpers on their own.
verifies("ports.secret-name-rule", () => {
  describe("isSecretName and secretKey", () => {
    it("accept a letter, then letters, digits, - or _, up to 128 characters", () => {
      for (const name of ["a", "openai-key", "SERVE_PASSWORD", `a${"b".repeat(127)}`]) {
        expect(isSecretName(name), name).toBe(true);
        expect(() => secretKey(name), name).not.toThrow();
      }
    });

    it("refuse anything else, secretKey with a RangeError", () => {
      for (const name of [
        "",
        "1key",
        "_key",
        "openai key",
        "a.b",
        "sérve",
        `a${"b".repeat(128)}`,
      ]) {
        expect(isSecretName(name), name).toBe(false);
        expect(() => secretKey(name), name).toThrow(RangeError);
      }
    });

    it("give names that differ only in case or in - versus _ the same key", () => {
      expect(secretKey("serve-password")).toBe("SERVE_PASSWORD");
      expect(secretKey("Serve_Password")).toBe("SERVE_PASSWORD");
    });
  });

  describe("describeSecretName", () => {
    it("quotes a name of at most 128 printable ASCII characters", () => {
      expect(describeSecretName("openai key")).toBe('Secret name "openai key"');
      expect(() => secretKey("openai key")).toThrow('Secret name "openai key" must be');
    });

    it("gives only the length of a longer name, so a value passed as a name isn't repeated", () => {
      const value = `v${"9".repeat(maxSecretNameLength)}`;
      expect(describeSecretName(value)).toBe("A secret name of 129 characters");
      // No 9 anywhere after the length: the value itself is not in the message.
      expect(() => secretKey(value)).toThrow(/^A secret name of 129 characters must be [^9]*$/);
    });

    it("gives only the length of a name with characters that aren't printable ASCII", () => {
      for (const name of ["sérve-password", "serve\npassword", "serve\u0000password"]) {
        expect(describeSecretName(name), JSON.stringify(name)).toBe(
          `A secret name of ${name.length} characters`,
        );
      }
    });
  });
});
