import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import {
  checkNotesSigned,
  listedUnsignedNotes,
  unsignedNotesRecord,
} from "../rules/notes-signed.ts";
import { runChecks } from "./fixture-repo.ts";

const pinnedKey = `sha256:${"A".repeat(43)}`;
const otherKey = `sha256:${"B".repeat(43)}`;
const approvers = JSON.stringify({
  internal: [{ id: pinnedKey }],
  "user-visible": [{ id: pinnedKey }],
});

/** A note in the format the note check accepts, signed by `key` unless it is `null`. */
function note(key: string | null, kind = "internal"): string {
  const signature = key === null ? "" : `- Signature: ed25519:${key}:${"x".repeat(86)}==\n`;
  return `# Decision: an example\n\n- Approval: HAL-1\n- Kind: ${kind}\n${signature}\nWhat changes and why.\n\n## Covers\n\n- example.rule\n`;
}

/** The notes-signed errors for these files, as "file: message". */
function problems(files: Record<string, string>): string[] {
  return runChecks([], {
    rules: ["notes-signed"],
    extraFiles: { "tooling/check/approvers.json": approvers, ...files },
  }).map((problem) => `${problem.file}: ${problem.message}`);
}

verifies("check.notes-signed", () => {
  test("fails on a note with no signature line, and names it", () => {
    const file = "decisions/alex/HAL-1-example.md";
    expect(problems({ [file]: note(null) })).toEqual([
      `${file}: This decision note isn't signed: the note has no signature line; ask the approver to sign it.`,
    ]);
  });

  test("fails on a note signed by a key approvers.json doesn't pin", () => {
    const file = "decisions/alex/HAL-1-example.md";
    expect(problems({ [file]: note(otherKey) })).toEqual([
      `${file}: This decision note is signed by ${otherKey}, a key tooling/check/approvers.json doesn't pin.`,
    ]);
  });

  test("fails on a signed note with a Kind the note format doesn't know", () => {
    const file = "decisions/alex/HAL-1-example.md";
    expect(problems({ [file]: note(pinnedKey, "public interface (`core/ports`)") })).toEqual([
      `${file}: This decision note is malformed: Add "- Kind: user-visible" or "- Kind: internal" (D13).`,
    ]);
  });

  test("passes a note with a well-formed signature from a pinned key", () => {
    expect(problems({ "decisions/alex/HAL-1-example.md": note(pinnedKey) })).toEqual([]);
  });

  test("passes an unsigned note that the record lists", () => {
    const file = "decisions/alex/HAL-1-example.md";
    const record = `${note(pinnedKey, "user-visible")}\n## Notes without a signature\n\n- \`${file}\`\n`;
    expect(problems({ [file]: note(null), [unsignedNotesRecord]: record })).toEqual([]);
  });

  test("still fails an unsigned note that the record doesn't list", () => {
    const record = `${note(pinnedKey, "user-visible")}\n## Notes without a signature\n\n- \`decisions/alex/HAL-2-other.md\`\n`;
    expect(
      problems({ "decisions/alex/HAL-1-example.md": note(null), [unsignedNotesRecord]: record }),
    ).toHaveLength(1);
  });

  test("leaves the unsigned note of the pull request's own branch to the note check", () => {
    const file = "decisions/alex/HAL-1-example.md";
    const context = {
      files: ["tooling/check/approvers.json", file],
      read: (path: string) => (path === file ? note(null) : approvers),
    } as unknown as Parameters<typeof checkNotesSigned>[0];
    expect(checkNotesSigned(context, "alex/HAL-1-example").problems).toEqual([]);
    expect(checkNotesSigned(context, "alex/HAL-2-other").problems).toHaveLength(1);
  });

  test("passes a repo without decision notes, even without approvers.json", () => {
    expect(runChecks([], { rules: ["notes-signed"] })).toEqual([]);
  });
});

describe("listedUnsignedNotes", () => {
  test("reads the paths under the heading, up to the next heading", () => {
    const text =
      "# Record\n\n## Notes without a signature\n\n- `decisions/a.md`\n- decisions/b.md\n\n## Covers\n\n- decisions/c.md\n";
    expect([...listedUnsignedNotes(text)]).toEqual(["decisions/a.md", "decisions/b.md"]);
  });

  test("is empty without the record", () => {
    expect(listedUnsignedNotes(undefined).size).toBe(0);
  });
});
