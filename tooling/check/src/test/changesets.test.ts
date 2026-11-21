import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { runChecks } from "./fixture-repo.ts";

/** The changesets errors for these files, as "file:line". */
function problems(files: Record<string, string>): string[] {
  return runChecks([], { rules: ["changesets"], extraFiles: files }).map(
    (problem) => `${problem.file}:${problem.line}`,
  );
}

const sentence = "\nRoutines now fire interval triggers at the right time.\n";

verifies("check.changesets-name-the-app", () => {
  test("passes a changeset that names the app", () => {
    expect(
      problems({ ".changeset/a.md": `---\n"@halonicjs/app-studio": patch\n---\n${sentence}` }),
    ).toEqual([]);
  });

  test("fails on a changeset that names the CLI, with its line", () => {
    expect(problems({ ".changeset/a.md": `---\n"halonic": patch\n---\n${sentence}` })).toEqual([
      ".changeset/a.md:2",
    ]);
  });

  test("fails only on the other package's line when the app is named too", () => {
    const text = `---\n"@halonicjs/app-studio": patch\n'@halonicjs/engine': minor\n---\n${sentence}`;
    expect(problems({ ".changeset/a.md": text })).toEqual([".changeset/a.md:3"]);
  });

  test("passes empty front matter and leaves the README alone", () => {
    expect(
      problems({
        ".changeset/empty.md": `---\n---\n${sentence}`,
        ".changeset/README.md": "---\nhalonic: patch\n---\n",
      }),
    ).toEqual([]);
  });

  test("tells the author which package to name", () => {
    const [problem] = runChecks([], {
      rules: ["changesets"],
      extraFiles: { ".changeset/a.md": `---\nhalonic: patch\n---\n${sentence}` },
    });
    expect(problem?.message).toContain("Name @halonicjs/app-studio instead");
  });
});
