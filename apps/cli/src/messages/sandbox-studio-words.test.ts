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

/**
 * The codes whose fix only Studio can carry out, so the CLI says Studio's fix
 * after "in Halonic Studio, ": only Studio's repair puts back the runtime of
 * its own WSL setup (C684 #3, HAL-16186).
 */
const fixInStudio: readonly string[] = ["runtime-missing"];

/**
 * The codes whose reason Studio words differently on purpose: in the CLI,
 * `runnerFence` gives `windows` on every plain Windows, so no Windows version
 * works; in Studio only MXC gives it, on a Windows it can't start on (HAL-12642).
 */
const reasonDiffersOnPurpose: readonly string[] = ["windows"];

verifies("cli.messages", () => {
  it("words every reason the same in Studio and the CLI, except the ones listed as different on purpose", () => {
    for (const code of sandboxUnavailableReasons) {
      if (reasonDiffersOnPurpose.includes(code)) {
        expect(sandboxStartWords(code).reason, code).not.toBe(
          plainText(sandboxMessages.reason(code).phrase),
        );
        continue;
      }
      expect(sandboxStartWords(code).reason, code).toBe(
        plainText(sandboxMessages.reason(code).phrase),
      );
    }
  });

  it("words every fix the same, except the ones listed as different on purpose", () => {
    for (const code of sandboxUnavailableReasons) {
      const cliFix = plainText(sandboxMessages.doctorFix(code).phrase);
      const studioFix = sandboxStartWords(code).fix;
      const inStudio = fixInStudio.includes(code) ? "in Halonic Studio, " : "";
      const expected = `Fix: ${inStudio}${studioFix} Then run halonic doctor again.`;
      if (fixDiffersOnPurpose.includes(code)) expect(cliFix, code).not.toContain(expected);
      else expect(cliFix, code).toContain(expected);
    }
  });
});
