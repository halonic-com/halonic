import type { ProfileEnvironment } from "@halonicjs/profile";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { plainText } from "./messages/phrase.ts";
import { printError } from "./print-error.ts";
import { checkProfileHome } from "./profile-home.ts";

// Built from parts, so the repo's leak guard doesn't read it as a real machine's path.
const drive = "D:";

/** A Linux environment with these variables. */
function linux(variables: Record<string, string>): ProfileEnvironment {
  return { platform: "linux", homeFolder: "/srv/acme", variables };
}

/** The error `checkProfileHome` throws for the environment. */
function refusalOf(environment: ProfileEnvironment): unknown {
  try {
    checkProfileHome(environment);
  } catch (error) {
    return error;
  }
  throw new Error("It was accepted.");
}

verifies("cli.profile-home", () => {
  describe("a HALONIC_HOME that isn't a full path", () => {
    it("says the profile's own sentence and to use $HOME for a ~ left in quotes", () => {
      const error = refusalOf(linux({ HALONIC_HOME: "~/.halonic" }));
      expect(error).toBeInstanceOf(KindedError);
      expect(error).toMatchObject({
        kind: "invalid_input",
        message: 'HALONIC_HOME must be a full path, not "~/.halonic".',
        fix: 'Inside quotes the shell doesn\'t turn ~ into your home folder. Use $HOME instead: HALONIC_HOME="$HOME/.halonic".',
      });
      expect((error as Error).cause).toBeInstanceOf(RangeError);
    });

    it("prints as a known cause after the command's Couldn't, with no bug report line", () => {
      const lines: string[] = [];
      printError(refusalOf(linux({ HALONIC_HOME: "~/.halonic" })), (line) =>
        lines.push(plainText(line)),
      );
      expect(lines).toEqual([
        '✕ HALONIC_HOME must be a full path, not "~/.halonic".',
        '  Inside quotes the shell doesn\'t turn ~ into your home folder. Use $HOME instead: HALONIC_HOME="$HOME/.halonic".',
      ]);
    });

    it("says to set a full path for any other relative folder", () => {
      expect(refusalOf(linux({ HALONIC_HOME: "profile" }))).toMatchObject({
        message: 'HALONIC_HOME must be a full path, not "profile".',
        fix: "Set HALONIC_HOME to a full path, such as $HOME/.halonic.",
      });
    });

    it("names the real home folder on Windows, also for a ~, since Windows doesn't expand $HOME there", () => {
      for (const home of ["profile", "~/.halonic"]) {
        const environment: ProfileEnvironment = {
          platform: "windows",
          homeFolder: `${drive}\\people\\acme`,
          variables: { HALONIC_HOME: home },
        };
        expect(refusalOf(environment)).toMatchObject({
          fix: `Set HALONIC_HOME to a full path, such as ${drive}\\people\\acme\\.halonic.`,
        });
      }
    });
  });

  it("leaves an absolute, empty or unset HALONIC_HOME alone", () => {
    for (const variables of [{ HALONIC_HOME: "/srv/acme/.halonic" }, { HALONIC_HOME: "" }, {}]) {
      const environment = linux(variables);
      expect(checkProfileHome(environment)).toBe(environment);
    }
  });
});
