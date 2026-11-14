import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { findDestructiveStatements } from "../rules/migrations-additive.ts";
import { runChecks } from "./fixture-repo.ts";

const dir = "packages/adapters/cloudflare-storage/src/migrations";

/** The migrations-additive errors for these files, as "file:line". */
function problems(files: Record<string, string>): string[] {
  return runChecks([], { rules: ["migrations-additive"], extraFiles: files }).map(
    (problem) => `${problem.file}:${problem.line}`,
  );
}

verifies("check.migrations-additive", () => {
  test("fails on a drop, with its line", () => {
    const file = `${dir}/0004-cleanup.ts`;
    expect(
      problems({
        [file]: 'export const m = {\n  statements: ["DROP TABLE record_changes"],\n};\n',
      }),
    ).toEqual([`${file}:2`]);
  });

  test("fails on a rename and on a changed column", () => {
    const file = `${dir}/0005-x.ts`;
    const text = [
      '"ALTER TABLE a RENAME TO b"',
      '"ALTER TABLE a RENAME COLUMN x TO y"',
      '"ALTER TABLE a ALTER COLUMN x TYPE TEXT"',
    ].join("\n");
    expect(problems({ [file]: text })).toEqual([`${file}:1`, `${file}:2`, `${file}:3`]);
  });

  test("fails on a NOT NULL column with no default only", () => {
    expect(findDestructiveStatements('"ALTER TABLE a ADD COLUMN n TEXT NOT NULL"')).toHaveLength(1);
    expect(
      findDestructiveStatements("\"ALTER TABLE a ADD COLUMN n TEXT NOT NULL DEFAULT ''\""),
    ).toEqual([]);
    expect(findDestructiveStatements('"ALTER TABLE a ADD COLUMN n TEXT"')).toEqual([]);
  });

  test("tells the author that migrations only add", () => {
    const [problem] = runChecks([], {
      rules: ["migrations-additive"],
      extraFiles: { [`${dir}/0004-x.ts`]: '"DROP INDEX i"\n' },
    });
    expect(problem?.message).toContain("Migrations only add");
  });

  test("allows additions, comments, other folders and test files", () => {
    expect(
      problems({
        [`${dir}/0004-add.ts`]:
          '// never DROP TABLE here\n"CREATE TABLE t (a TEXT)"\n"CREATE INDEX i ON t (a)"\n',
        "packages/core/std/src/drop.ts": '"DROP TABLE t"\n',
        [`${dir}/0004-add.test.ts`]: '"DROP TABLE t"\n',
      }),
    ).toEqual([]);
  });
});
