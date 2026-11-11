import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { ProgramStart } from "../../shared/program-start.ts";
import { type PathLookup, touchesSkillScripts } from "./scripts-folder.ts";

/**
 * A file system with links that lead into a skill's scripts: `/w/innocent`,
 * and `/w/my link`, `/w/a:b` and `/w/a@b`, whose names hold a separator. Paths are resolved the POSIX way, which is enough for the rule;
 * the adapters' tests run it on Node's own `resolve` and `realpath`.
 */
const paths: PathLookup = {
  resolve: (cwd, part) => normalize(part.startsWith("/") ? part : `${cwd}/${part}`),
  realpath: async (path) => {
    if (["/w/innocent", "/w/my link", "/w/a:b", "/w/a@b"].includes(path)) {
      return "/w/skills/mail/scripts/send.js";
    }
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
      ["a link with a space in its name", start("node", ["--file=my link"])],
      ["a link with a : in its name", start("node", ["--file=a:b"])],
      ["a link with an @ in its name", start("node", ["--file=a@b"])],
      ["a link with a : after a second =", start("node", ["--define=KEY=a:b"])],
    ])("is true for %s joined with = (HAL-3628)", async (_, bad) => {
      expect(await touchesSkillScripts(bad, paths)).toBe(true);
    });

    it.each([
      ["a link after a second =", start("node", ["--define=KEY=innocent"])],
      ["a path after a :", start("node", ["file:skills/mail/scripts/send.js"])],
      ["a link after an @", start("node", ["@innocent"])],
      ["a link behind a short flag", start("python", ["-cinnocent"])],
      ["a link between spaces", start("node", ["--require innocent"])],
      ["a module that python -m runs", start("python", ["-m", "skills.mail.scripts.send"])],
      ["a module written with -m", start("python", ["-mskills.mail.scripts.send"])],
      [
        "an env value",
        { ...start("node"), env: { NODE_OPTIONS: "--require skills/mail/scripts/send.js" } },
      ],
      ["a linked env value", { ...start("python"), env: { PYTHONPATH: "/usr/lib:innocent" } }],
    ])("is true for %s, read as the working-folder guards read it (HAL-4777)", async (_, bad) => {
      expect(await touchesSkillScripts(bad, paths)).toBe(true);
    });

    it.each([
      ["a module after -m among short flags", start("python", ["-Im", "skills.mail.scripts.send"])],
      [
        "a module written with -m among short flags",
        start("python", ["-Imskills.mail.scripts.send"]),
      ],
      [
        "a quoted env value",
        { ...start("node"), env: { NODE_OPTIONS: '--require "skills/mail/scripts/send.js"' } },
      ],
      ["a quoted argument", start("node", ["--require='skills/mail/scripts/send.js'"])],
      ["a quoted link with a space in its name", start("node", ['--file="my link"'])],
      [
        "a module written with -m after a group of short flags ending in m",
        start("python", ["-Wm", "-mskills.mail.scripts.send"]),
      ],
      [
        "a module written with -m after -Im",
        start("python", ["-Im", "-mskills.mail.scripts.send"]),
      ],
      [
        "a double-quoted link after a stray apostrophe",
        { ...start("node"), env: { NODE_OPTIONS: `--title it's --require "my link" '` } },
      ],
    ])("is true for %s (HAL-4903)", async (_, bad) => {
      expect(await touchesSkillScripts(bad, paths)).toBe(true);
    });

    it.each([
      ["a bare name", start("scripts")],
      ["a scripts folder outside a skill", start("./tools/scripts/run.sh")],
      ["a skill's own file", start("skills/x/SKILL.md")],
      ["other arguments", start("node", ["scripts/build.js", "skills/mail/SKILL.md"])],
      ["an option with a harmless value", start("node", ["--file=scripts/build.js"])],
      ["an option without a value", start("node", ["--verbose", "--name="])],
      ["a harmless module", start("python", ["-m", "tools.scripts.send"])],
      ["a harmless module among short flags", start("python", ["-Im", "tools.scripts.send"])],
      ["a harmless quoted value", { ...start("node"), env: { NODE_OPTIONS: '--require "x.js"' } }],
      ["a harmless env value", { ...start("node"), env: { NODE_PATH: "tools/lib:/usr/lib" } }],
      ["an env name alone", { ...start("node"), env: { "skills/mail/scripts/send.js": "1" } }],
    ])("is false for %s", async (_, fine) => {
      expect(await touchesSkillScripts(fine, paths)).toBe(false);
    });
  });
});
