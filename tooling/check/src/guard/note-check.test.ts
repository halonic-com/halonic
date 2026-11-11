import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { approvers, type Files, fakeGit, keyPair } from "../test/signing-fixture.ts";
import type { PullRequest } from "./approvals.ts";
import { policyFile } from "./guarded-paths.ts";
import { checkNotes } from "./note-check.ts";
import {
  approversFile,
  coveredObjects,
  coveredPaths,
  signatureLine,
  signedText,
} from "./signatures.ts";

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
    mergeBase: base,
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

const policy = (extraExports: Record<string, string[]>, published: string[] = []): string =>
  `${JSON.stringify({ coreOrder: ["@halonicjs/std"], published, extraExports }, null, 2)}\n`;

/** Runs the check on a pull request that changes policy.json to `after`, plus `extra` files. */
async function policyErrorsOf(
  after: string,
  text: string | undefined,
  signer: string,
  extra: Files = {},
): Promise<string[]> {
  const before = { ...baseFiles, [policyFile]: policy({}) };
  const headFiles = { ...before, [policyFile]: after, ...extra };
  const files =
    text === undefined ? headFiles : { ...headFiles, [noteFile]: signed(text, headFiles, signer) };
  const report = await checkNotes({
    pull,
    branch,
    changed: [policyFile, ...Object.keys(extra)],
    mergeBase: base,
    git: fakeGit({ [base]: before, [head]: files }),
  });
  return report.problems.map((problem) => `${problem.file}: ${problem.message}`);
}

/** `text` with a signature line over its Covers paths at the head, made with `privatePem`. */
function signed(text: string, headFiles: Files, privatePem: string): string {
  const git = fakeGit({ [base]: baseFiles, [head]: headFiles });
  const kind = text.includes("Kind: internal") ? "internal" : "user-visible";
  const covers = (text.split("## Covers")[1] ?? "").match(/(?<=^- ).+$/gm) ?? [];
  const objects = coveredObjects(coveredPaths(covers, git, head, base), git, head);
  const facts = { repo: pull.repo, pr: pull.number, kind, unsigned: text, objects } as const;
  return text.replace(/(- Kind: .*\n)/, `$1${signatureLine(signedText(facts), privatePem)}\n`);
}

verifies("check.guard-extra-exports", () => {
  const added = policy({ "@halonicjs/std": ["./error-kind"] });

  test("passes a change to extraExports alone with an internal note the CTO signed", async () => {
    expect(await policyErrorsOf(added, note("internal", policyFile), cto.privatePem)).toEqual([]);
  });

  test("fails it without a note, or with a note that doesn't list policy.json", async () => {
    expect(await policyErrorsOf(added, undefined, cto.privatePem)).toEqual([
      `${policyFile}: Changes extraExports in ${policyFile}. That needs a signed note (internal is enough): add ${noteFile} and list "${policyFile}" under Covers.`,
    ]);
    expect(await policyErrorsOf(added, note("internal", "turbo.json"), cto.privatePem)).toEqual([
      expect.stringContaining(`doesn't list "${policyFile}" under Covers`),
    ]);
  });

  test("counts any other change to policy.json as a change under tooling/check/", async () => {
    const other = policy({ "@halonicjs/std": ["./error-kind"] }, ["@halonicjs/std"]);
    expect(await policyErrorsOf(other, note("internal", policyFile), cto.privatePem)).toEqual([
      `${noteFile}: Changes the guard's own path tooling/check/, but the note doesn't list "tooling/check/" under Covers.`,
    ]);
    expect(
      await policyErrorsOf(other, note("user-visible", "tooling/check/"), user.privatePem),
    ).toEqual([]);
  });

  test("counts it under tooling/check/ when another guard file changes with it", async () => {
    const extra = { "tooling/check/src/guard/guard.ts": "export {};\n" };
    const errors = await policyErrorsOf(added, note("internal", policyFile), cto.privatePem, extra);
    expect(errors).toEqual([
      `${noteFile}: Changes the guard's own path tooling/check/, but the note doesn't list "tooling/check/" under Covers.`,
    ]);
  });

  test("fails an internal note signed by a key other than the CTO's", async () => {
    expect(await policyErrorsOf(added, note("internal", policyFile), user.privatePem)).toEqual([
      expect.stringMatching(/approval isn't verified/),
    ]);
  });
});
