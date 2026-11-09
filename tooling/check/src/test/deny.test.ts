import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadContext } from "../lib/context.ts";
import { readDeny } from "../lib/deny.ts";
import { checkDeny, denyPath } from "../rules/deny.ts";
import { removeFixtureRepo, runChecks, writeFixtureRepo } from "./fixture-repo.ts";

const today = new Date("2026-11-09T12:00:00Z");
const realRoot = join(import.meta.dirname, "..", "..", "..", "..");

const licences = JSON.stringify({ shipped: ["MIT", "Apache-2.0"], devOnly: [], corrections: {} });

function deny(options: { allow?: string[]; ignore?: string } = {}): string {
  const allow = (options.allow ?? ["MIT", "Apache-2.0"]).map((id) => `"${id}"`).join(", ");
  return `[licenses]\nallow = [\n  ${allow},\n]\nexceptions = [\n  { allow = ["MPL-2.0"], crate = "selectors" },\n]\n\n[advisories]\n# comment with [brackets] and "quotes"\nignore = [${options.ignore ?? ""}]\n\n[bans]\nmultiple-versions = "allow"\n`;
}

function ignoring(id: string, reason: string): string {
  return `\n  { id = "${id}", reason = "${reason}" },\n`;
}

function problems(text: string, files: Record<string, string> = {}, now = today): string[] {
  const root = writeFixtureRepo([], {
    extraFiles: { [denyPath]: text, "tooling/check/licences.json": licences, ...files },
  });
  try {
    return checkDeny(loadContext(root), now).problems.map((problem) => problem.message);
  } finally {
    removeFixtureRepo(root);
  }
}

describe("tooling/check: deny.toml reader", () => {
  it("reads the licences and the ignores, with brackets and braces inside text", () => {
    const text = deny({
      ignore: ignoring("RUSTSEC-2026-0001", "Only {build} time [x]. Expires 2027-01-01."),
    });
    expect(readDeny(text)).toEqual({
      allow: ["MIT", "Apache-2.0"],
      ignore: [{ id: "RUSTSEC-2026-0001", reason: "Only {build} time [x]. Expires 2027-01-01." }],
    });
  });

  it("reads a plain-string ignore, and keeps braces in tables out of it", () => {
    expect(
      readDeny(deny({ ignore: '"RUSTSEC-2026-0002", { id = "a}", reason = "x" }' })).ignore,
    ).toEqual([
      { id: "RUSTSEC-2026-0002", reason: "", plain: true },
      { id: "a}", reason: "x" },
    ]);
  });

  it("reports a missing list as undefined", () => {
    expect(readDeny("[bans]\n")).toEqual({ allow: undefined, ignore: undefined });
  });

  it("reads the real file", () => {
    const real = readDeny(readFileSync(join(realRoot, denyPath), "utf8"));
    expect(real.allow?.length).toBeGreaterThan(5);
    expect(real.ignore?.every((entry) => entry.id.startsWith("RUSTSEC-"))).toBe(true);
  });
});

describe("tooling/check: deny-toml rule", () => {
  it("passes for matching licences and a valid ignore", () => {
    expect(
      problems(
        deny({ ignore: ignoring("RUSTSEC-2026-0001", "Build time only. Expires 2027-01-01.") }),
      ),
    ).toEqual([]);
    expect(problems(deny())).toEqual([]);
  });

  it("passes for the real deny.toml against the real licences.json", () => {
    const real = (path: string): string => readFileSync(join(realRoot, path), "utf8");
    expect(
      problems(
        real(denyPath),
        {
          "tooling/check/licences.json": real("tooling/check/licences.json"),
        },
        new Date(),
      ),
    ).toEqual([]);
  });

  it("does nothing without a deny.toml", () => {
    expect(runChecks([], { rules: ["deny-toml"] })).toEqual([]);
  });

  it("fails when a licence differs from the shipped list, in either direction", () => {
    expect(problems(deny({ allow: ["MIT"] }))[0]).toContain("missing: Apache-2.0");
    expect(problems(deny({ allow: ["MIT", "Apache-2.0", "GPL-3.0-only"] }))[0]).toContain(
      'not in "shipped": GPL-3.0-only',
    );
  });

  it("fails on an ignore with no date, two dates, or no reason", () => {
    expect(
      problems(deny({ ignore: ignoring("RUSTSEC-2026-0001", "Build time only.") }))[0],
    ).toContain("must name exactly one expiry date");
    expect(
      problems(
        deny({ ignore: ignoring("RUSTSEC-2026-0001", "Since 2026-10-01. Expires 2027-01-01.") }),
      )[0],
    ).toContain("must name exactly one expiry date");
    expect(problems(deny({ ignore: ignoring("RUSTSEC-2026-0001", "") }))[0]).toContain(
      "needs a reason",
    );
  });

  it("fails on a plain-string ignore, which has no reason or expiry", () => {
    const messages = problems(deny({ ignore: '"RUSTSEC-2026-0001"' }));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("RUSTSEC-2026-0001 is a plain string");
    expect(
      problems(
        deny({
          ignore: `"RUSTSEC-2026-0002", ${ignoring("RUSTSEC-2026-0001", "Expires 2027-01-01.")}`,
        }),
      ),
    ).toHaveLength(1);
  });

  it("fails on an expired ignore but not on its last day", () => {
    expect(
      problems(deny({ ignore: ignoring("RUSTSEC-2026-0001", "Expires 2026-11-09.") })),
    ).toEqual([]);
    expect(
      problems(deny({ ignore: ignoring("RUSTSEC-2026-0001", "Expires 2026-11-08.") }))[0],
    ).toContain("has passed");
  });

  it("allows at most 90 days", () => {
    expect(
      problems(deny({ ignore: ignoring("RUSTSEC-2026-0001", "Expires 2027-02-07.") })),
    ).toEqual([]);
    expect(
      problems(deny({ ignore: ignoring("RUSTSEC-2026-0001", "Expires 2027-02-08.") }))[0],
    ).toContain("91 days out");
  });

  it("fails on a repeated id, a missing list, and a missing licences.json", () => {
    const twice = ignoring("RUSTSEC-2026-0001", "Expires 2027-01-01.").repeat(2);
    expect(problems(deny({ ignore: twice }))[0]).toContain("is repeated");
    expect(problems("[licenses]\nallow = []\n")).toContain(
      `${'[advisories] needs an "ignore" list, empty when nothing is ignored.'} See docs/guides/checks.md.`,
    );
    const root = writeFixtureRepo([], { extraFiles: { [denyPath]: deny() } });
    try {
      expect(checkDeny(loadContext(root), today).problems[0]?.message).toContain(
        "The file is missing",
      );
    } finally {
      removeFixtureRepo(root);
    }
  });
});
