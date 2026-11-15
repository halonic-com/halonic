import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  base,
  baseFiles,
  branch,
  cto,
  head,
  note,
  noteFile,
  pull,
  signed,
} from "../test/note-fixture.ts";
import { type Files, fakeGit } from "../test/signing-fixture.ts";
import { checkNotes } from "./note-check.ts";

verifies("check.guard-notes-append-only", () => {
  const oldNote = "decisions/kim/HAL-1-old.md";
  const baseWithNote: Files = { ...baseFiles, [oldNote]: note("internal", "turbo.json") };

  /** A pull request that edits (or, with `deleted`, deletes) the old note and adds `text`. */
  const edited = { ...baseWithNote, [oldNote]: note("internal", "turbo.json", "extra") };
  const { [oldNote]: _gone, ...deletedFiles } = baseWithNote;

  async function errors(text: string | undefined, deleted = false): Promise<string[]> {
    const headFiles = deleted ? deletedFiles : edited;
    const files = text === undefined ? headFiles : { ...headFiles, [noteFile]: text };
    return (
      await checkNotes({
        pull,
        branch,
        changed: [oldNote],
        mergeBase: base,
        git: fakeGit({ [base]: baseWithNote, [head]: files }),
      })
    ).problems.map((problem) => `${problem.file}: ${problem.message}`);
  }

  const withNote = (kind: string, ...covers: string[]) =>
    signed(note(kind, ...covers), edited, cto.privatePem);

  test("fails an edit or a deletion of a note on base without a note", async () => {
    const expected = [expect.stringContaining(`${oldNote}: Edits or deletes ${oldNote}`)];
    expect(await errors(undefined)).toEqual(expected);
    expect(await errors(undefined, true)).toEqual(expected);
  });

  test("fails a note that doesn't list the path, or an internal one", async () => {
    expect(await errors(withNote("user-visible", "turbo.json"))).toEqual([
      expect.stringContaining(`doesn't list "${oldNote}" under Covers`),
    ]);
    expect(await errors(withNote("internal", oldNote))).toEqual([
      expect.stringContaining("Kind must be user-visible"),
    ]);
  });

  test("passes a user-visible note that lists the path, for an edit and a deletion", async () => {
    const sign = (files: Files) => signed(note("user-visible", oldNote), files, cto.privatePem);
    const run = async (files: Files) =>
      (
        await checkNotes({
          pull,
          branch,
          changed: [oldNote, noteFile],
          mergeBase: base,
          git: fakeGit({ [base]: baseWithNote, [head]: { ...files, [noteFile]: sign(files) } }),
        })
      ).problems;
    expect(await run(edited)).toEqual([]);
    expect(await run(deletedFiles)).toEqual([]);
  });

  test("fails an edit of the branch's own note when base already has it", async () => {
    const report = await checkNotes({
      pull,
      branch,
      changed: [noteFile],
      mergeBase: base,
      git: fakeGit({
        [base]: { ...baseWithNote, [noteFile]: note("internal", "turbo.json") },
        [head]: { ...baseWithNote, [noteFile]: note("internal", "turbo.json", "extra") },
      }),
    });
    const messages = report.problems.map((problem) => problem.message);
    expect(messages).not.toEqual([]);
    expect(messages[0]).toContain(`Edits or deletes ${noteFile}`);
  });

  test("ignores the branch's own note when new and a note added in the pull request", async () => {
    const report = await checkNotes({
      pull,
      branch,
      changed: [noteFile, "decisions/kim/HAL-2-new.md"],
      mergeBase: base,
      git: fakeGit({ [base]: baseWithNote, [head]: baseWithNote }),
    });
    expect(report.problems).toEqual([]);
  });
});
