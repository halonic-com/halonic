import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { approvers, type Files, fakeGit, keyPair } from "../test/signing-fixture.ts";
import type { PullRequest } from "./approvals.ts";
import { checkNotes } from "./note-check.ts";
import { approversFile, signatureLine, signedText } from "./signatures.ts";

const user = keyPair();
const cto = keyPair();
const branch = "julian/HAL-1337-example";
const noteFile = `decisions/${branch}.md`;
const base = "b".repeat(40);
const head = "a".repeat(40);
const pull: PullRequest = { repo: "halonic-com/halonic", number: 7, head, base };
const baseFiles: Files = {
  [approversFile]: approvers({ internal: [cto.publicKey], "user-visible": [user.publicKey] }),
  ".github/workflows/ci.yml": "on: pull_request\n",
};

const note = (kind: string, ...covers: string[]) => `# Decision: change CI

- Approval: https://paperclip.example/HAL/issues/HAL-1337
- Kind: ${kind}

The build needs a new step.

## Covers

${covers.map((entry) => `- ${entry}`).join("\n")}
`;

/** Runs the check on a pull request that changes ci.yml and adds `text`, signed by `signer`. */
async function errorsOf(
  text: string | undefined,
  signer = user.privatePem,
  changedFile = ".github/workflows/ci.yml",
): Promise<string[]> {
  const headFiles = { ...baseFiles, [changedFile]: "on: [pull_request]\n" };
  const git = fakeGit({ [base]: baseFiles, [head]: headFiles });
  const files =
    text === undefined
      ? headFiles
      : {
          ...headFiles,
          [noteFile]: text.replace(/(- Kind: .*\n)/, `$1${sign(text, git, signer)}\n`),
        };
  const report = await checkNotes({
    pull,
    branch,
    changed: [changedFile],
    git: fakeGit({ [base]: baseFiles, [head]: files }),
  });
  return report.problems.map((problem) => `${problem.file}: ${problem.message}`);
}

function sign(text: string, git: ReturnType<typeof fakeGit>, privatePem: string): string {
  const kind = text.includes("Kind: internal") ? "internal" : "user-visible";
  const covered = [".github", ".gitattributes", "turbo.json", approversFile].filter((path) =>
    text.split("\n").some((line) => line === `- ${path}` || line === `- ${path}/`),
  );
  const objects = new Map(covered.map((path) => [path, git.objectId(head, path) ?? "missing"]));
  const signed = signedText({ repo: pull.repo, pr: pull.number, kind, unsigned: text, objects });
  return signatureLine(signed, privatePem);
}

verifies("check.guard-notes-own-paths", () => {
  test("fails a change to .github/ without a note, and names the note", async () => {
    expect(await errorsOf(undefined)).toEqual([
      `.github/: Changes the guard's own path .github/. That needs a signed decision note: add ${noteFile} and list ".github/" under Covers.`,
    ]);
  });

  test("passes it with a user-visible note that lists .github/ and the user's signature", async () => {
    expect(await errorsOf(note("user-visible", ".github/"))).toEqual([]);
  });

  test("passes .github/ with an internal note the CTO signed, until a user key is pinned", async () => {
    expect(await errorsOf(note("internal", ".github/"), cto.privatePem)).toEqual([]);
  });

  test("passes .gitattributes and tooling/check/ the same way, but not the approvers file or turbo.json", async () => {
    expect(
      await errorsOf(note("internal", ".gitattributes"), cto.privatePem, ".gitattributes"),
    ).toEqual([]);
    for (const path of [approversFile, "turbo.json"]) {
      const errors = await errorsOf(note("internal", path), cto.privatePem, path);
      expect(errors).toContainEqual(
        expect.stringContaining("so the note's Kind must be user-visible"),
      );
    }
  });

  test("fails a note that doesn't list the path, or whose signature doesn't verify", async () => {
    const unlisted = await errorsOf(note("user-visible", "turbo.json"));
    expect(unlisted[0]).toMatch(/doesn't list "\.github\/" under Covers/);
    const wrongKey = await errorsOf(note("user-visible", ".github/"), cto.privatePem);
    expect(wrongKey).toEqual([
      expect.stringMatching(/approval isn't verified: the key .* may only sign internal notes/),
    ]);
  });
});
