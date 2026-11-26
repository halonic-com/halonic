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

verifies("check.changesets-patch-only", () => {
  test("fails on a minor changeset, with its line", () => {
    expect(
      problems({ ".changeset/a.md": `---\n"@halonicjs/app-studio": minor\n---\n${sentence}` }),
    ).toEqual([".changeset/a.md:2"]);
  });

  test("fails on a major changeset", () => {
    expect(
      problems({ ".changeset/a.md": `---\n'@halonicjs/app-studio': major\n---\n${sentence}` }),
    ).toEqual([".changeset/a.md:2"]);
  });

  test("names the file and says to use patch until a minor release is approved", () => {
    const [problem] = runChecks([], {
      rules: ["changesets"],
      extraFiles: { ".changeset/a.md": `---\n"@halonicjs/app-studio": minor\n---\n${sentence}` },
    });
    expect(problem?.message).toContain(".changeset/a.md");
    expect(problem?.message).toContain("Use patch until a minor release is approved");
  });
});

/** A patch changeset with this text as its body. */
function changeset(body: string): string {
  return `---\n"@halonicjs/app-studio": patch\n---\n\n${body}\n`;
}

verifies("check.changesets-no-bare-placeholders", () => {
  test("fails on a bare <Agent> in the text, with its line", () => {
    expect(
      problems({ ".changeset/a.md": changeset('The Messenger shows "<Agent> is typing…".') }),
    ).toEqual([".changeset/a.md:5"]);
  });

  test("fails on a placeholder of two words", () => {
    expect(
      problems({ ".changeset/a.md": changeset('It shows "What should change in <skill name>?".') }),
    ).toEqual([".changeset/a.md:5"]);
  });

  test("passes a placeholder inside backticks", () => {
    expect(
      problems({
        ".changeset/a.md": changeset("`halonic deploy <deployment>` deploys the workspace."),
      }),
    ).toEqual([]);
  });

  test("passes a placeholder written as {name}", () => {
    expect(problems({ ".changeset/a.md": changeset('The chat says "About: {name}".') })).toEqual(
      [],
    );
  });

  test("passes an autolink", () => {
    expect(
      problems({
        ".changeset/a.md": changeset("See <https://halonic.dev> or <mailto:hello@halonic.dev>."),
      }),
    ).toEqual([]);
  });

  test("passes a placeholder inside a fenced block, and checks the lines after it", () => {
    const body = "Run it like this:\n\n```sh\nhalonic run <x>\n```\n\nThen <Agent> answers.";
    expect(problems({ ".changeset/a.md": changeset(body) })).toEqual([".changeset/a.md:11"]);
  });

  test("names the file and line and says to write {name} or use backticks", () => {
    const [problem] = runChecks([], {
      rules: ["changesets"],
      extraFiles: { ".changeset/a.md": changeset('It shows "<Agent> is typing…".') },
    });
    expect(problem?.message).toContain(".changeset/a.md");
    expect(problem?.message).toContain("line 5");
    expect(problem?.message).toContain("Write placeholders as {name}");
    expect(problem?.message).toContain("put the command in backticks");
  });
});
