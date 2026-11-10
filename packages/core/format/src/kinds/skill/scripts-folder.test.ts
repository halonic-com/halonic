import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type PathLookup, type ProgramStart, touchesSkillScripts } from "./scripts-folder.ts";

/**
 * A file system with one link, `/w/innocent`, that leads into a skill's
 * scripts. Paths are resolved the POSIX way, which is enough for the rule;
 * the adapters' tests run it on Node's own `resolve` and `realpath`.
 */
const paths: PathLookup = {
  resolve: (cwd, part) => normalize(part.startsWith("/") ? part : `${cwd}/${part}`),
  realpath: async (path) => {
    if (path === "/w/innocent") return "/w/skills/mail/scripts/send.js";
    if (path === "/w/tools") return "/w/skills/mail/scripts";
    throw new Error(`nothing at ${path}`);
  },
};

function normalize(path: string): string {
  const kept: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "..") kept.pop();
    else if (segment !== "" && segment !== ".") kept.push(segment);
  }
  return `/${kept.join("/")}`;
}

const start = (program: string, args: string[] = [], cwd = "/w"): ProgramStart => ({
  cwd,
  program,
  args,
});

verifies("format.skill-scripts-folder", () => {
  describe("touchesSkillScripts", () => {
    it.each([
      ["an absolute program", start("/w/library/skills/mail/scripts/send")],
      ["a relative program", start("library/skills/mail/scripts/send")],
      ["a Windows-style program", start("skills\\mail\\scripts\\send.ps1")],
      ["a mixed-case program", start("/w/Skills/mail/Scripts/send")],
      ["a script as an argument", start("node", ["skills/mail/scripts/send.js"])],
      ["the script folder itself", start("ls", ["library/skills/mail/scripts"])],
      ["a relative script from the skill", start("sh", ["./scripts/send"], "/w/skills/mail")],
      ["a start inside the script folder", start("sh", ["send"], "/w/skills/mail/scripts")],
      ["a way round with ..", start("../w/skills/mail/scripts/send")],
      ["a link as the program", start("./innocent")],
      ["a link as an argument", start("sh", ["innocent"])],
      ["a start in a linked folder", start("sh", ["send"], "/w/tools")],
    ])("is true for %s", async (_, bad) => {
      expect(await touchesSkillScripts(bad, paths)).toBe(true);
    });

    it.each([
      ["a long option", start("node", ["--file=skills/mail/scripts/send.js"])],
      ["a short option", start("node", ["-f=skills/mail/scripts/send.js"])],
      ["a Windows-style value", start("node", ["--file=skills\\mail\\scripts\\send.ps1"])],
      ["a value with ..", start("node", ["--file=../w/skills/mail/scripts/send.js"])],
      ["a value from the skill", start("node", ["--file=./scripts/send.js"], "/w/skills/mail")],
      ["a value that is a link", start("node", ["--file=innocent"])],
      ["a second = value", start("node", ["--define=KEY=skills/mail/scripts/send.js"])],
    ])("is true for %s joined with = (HAL-3628)", async (_, bad) => {
      expect(await touchesSkillScripts(bad, paths)).toBe(true);
    });

    it.each([
      ["a bare name", start("scripts")],
      ["a scripts folder outside a skill", start("./tools/scripts/run.sh")],
      ["a skill's own file", start("skills/x/SKILL.md")],
      ["other arguments", start("node", ["scripts/build.js", "skills/mail/SKILL.md"])],
      ["an option with a harmless value", start("node", ["--file=scripts/build.js"])],
      ["an option without a value", start("node", ["--verbose", "--name="])],
    ])("is false for %s", async (_, fine) => {
      expect(await touchesSkillScripts(fine, paths)).toBe(false);
    });
  });
});
