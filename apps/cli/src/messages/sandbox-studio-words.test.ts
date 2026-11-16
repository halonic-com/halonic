import { sandboxStartWords } from "@halonicjs/app";
import { sandboxUnavailableReasons } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { plainText } from "./phrase.ts";
import { sandboxMessages } from "./sandbox.ts";

/**
 * The codes whose fix Studio words differently from the CLI on purpose: the
 * CLI says "use Halonic inside WSL 2" because 0.1 has no Studio on Windows
 * (HAL-7540), and Studio points to Settings. A new difference is a decision:
 * add the code here with its reason.
 */
const fixDiffersOnPurpose: readonly string[] = [
  "windows",
  "distro-missing",
  "setup-conflict",
  "setup-needed",
];

verifies("cli.messages", () => {
  it("words every reason the same in Studio and the CLI: same code, same sentence", () => {
    for (const code of sandboxUnavailableReasons) {
      expect(sandboxStartWords(code).reason, code).toBe(
        plainText(sandboxMessages.reason(code).phrase),
      );
    }
  });

  it("words every fix the same, except the ones listed as different on purpose", () => {
    for (const code of sandboxUnavailableReasons) {
      const cliFix = plainText(sandboxMessages.doctorFix(code).phrase);
      const studioFix = `Fix: ${sandboxStartWords(code).fix} Then run halonic doctor again.`;
      if (fixDiffersOnPurpose.includes(code)) expect(cliFix, code).not.toContain(studioFix);
      else expect(cliFix, code).toContain(studioFix);
    }
  });
});
