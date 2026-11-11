import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { approvers, type Files, fakeGit, keyPair } from "../test/signing-fixture.ts";
import { type ApprovalVerdict, type PullRequest, signedApprovals } from "./approvals.ts";
import { parseDecisionNote } from "./decision-notes.ts";
import {
  approversFile,
  coveredObjects,
  coveredPaths,
  signatureLine,
  signedText,
  splitSignature,
} from "./signatures.ts";

const cto = keyPair();
const user = keyPair();
const stranger = keyPair();

const noteFile = "decisions/julian/HAL-1337-example.md";
const timerTest = "packages/core/workflow/src/timer.test.ts";
const timerSpec = "packages/core/workflow/requirements/timer-fires.md";

const note = (kind = "internal") => `# Decision: retire the old timer rule

- Approval: https://paperclip.example/HAL/issues/HAL-1337
- Kind: ${kind}

The timer moved to the routines package.

## Covers

- workflow.timer-fires
- ${timerTest}
`;

const baseFiles: Files = {
  "packages/core/workflow/package.json": "{}",
  [timerSpec]: "# workflow.timer-fires\n",
  [timerTest]: "test('fires')\n",
  [approversFile]: approvers({ internal: [cto.publicKey], "user-visible": [user.publicKey] }),
};
const base = "b".repeat(40);
const head = "a".repeat(40);
const pull: PullRequest = { repo: "halonic-com/halonic", number: 7, head, base };

/** Signs `text` as the approver would for `signedFor`, and puts the line under Kind. */
function signed(text: string, files: Files, privatePem: string, signedFor = pull): string {
  const git = fakeGit({ [base]: baseFiles, [head]: { ...files, [noteFile]: text } });
  const parsed = parseDecisionNote(noteFile, text);
  if (!parsed.ok) {
    throw new Error("test note doesn't parse");
  }
  const line = signatureLine(
    signedText({
      repo: signedFor.repo,
      pr: signedFor.number,
      kind: parsed.note.kind,
      unsigned: text,
      objects: coveredObjects(coveredPaths(parsed.note.covers, git, head, base), git, head),
    }),
    privatePem,
  );
  return text.replace(/(- Kind: .*\n)/, `$1${line}\n`);
}

interface Case {
  readonly text: string;
  readonly head?: Files;
  readonly base?: Files;
  readonly pull?: PullRequest | undefined;
}

async function verdictOf(run: Case): Promise<ApprovalVerdict> {
  const headFiles = { ...(run.head ?? baseFiles), [noteFile]: run.text };
  const git = fakeGit({ [base]: run.base ?? baseFiles, [head]: headFiles });
  const parsed = parseDecisionNote(noteFile, run.text);
  if (!parsed.ok) {
    throw new Error("test note doesn't parse");
  }
  const lookup = signedApprovals("pull" in run ? run.pull : pull, git);
  return lookup.check({ note: parsed.note });
}

const reasonOf = async (run: Case): Promise<string> => {
  const verdict = await verdictOf(run);
  return verdict.approved ? "approved" : verdict.reason;
};

verifies("check.guard-signed-notes", () => {
  test("approves a note the CTO's pinned key signed for this pull request", async () => {
    expect(await verdictOf({ text: signed(note(), baseFiles, cto.privatePem) })).toEqual({
      approved: true,
    });
  });

  test("signs a tagged text with one field per line and the covered objects, sorted", () => {
    const git = fakeGit({ [base]: baseFiles, [head]: baseFiles });
    const text = signedText({
      ...{ repo: pull.repo, pr: pull.number, kind: "internal" as const, unsigned: "x" },
      objects: coveredObjects(
        coveredPaths(["workflow.timer-fires", timerTest], git, head, base),
        git,
        head,
      ),
    });
    expect(text.split("\n").map((line) => line.replace(/[0-9a-f]{40,}/, "<hash>"))).toEqual([
      "halonic-decision-v1",
      "repo halonic-com/halonic",
      "pr 7",
      "kind internal",
      "note <hash>",
      `object <hash> ${timerSpec}`,
      `object <hash> ${timerTest}`,
      "",
    ]);
  });

  test("rejects the signature replayed on another pull request with the same branch name", async () => {
    const forOther = signed(note(), baseFiles, cto.privatePem, { ...pull, number: 8 });
    expect(await reasonOf({ text: forOther })).toMatch(/doesn't match/);
    const forFork = signed(note(), baseFiles, cto.privatePem, { ...pull, repo: "someone/halonic" });
    expect(await reasonOf({ text: forFork })).toMatch(/doesn't match/);
  });

  test("rejects a note edited after signing", async () => {
    const text = signed(note(), baseFiles, cto.privatePem).replace("routines", "scheduler");
    expect(await reasonOf({ text })).toMatch(/doesn't match/);
  });

  test("rejects a covered test or requirement edited after signing, but not other files", async () => {
    const text = signed(note(), baseFiles, cto.privatePem);
    expect(await reasonOf({ text, head: { ...baseFiles, [timerTest]: "" } })).toMatch(
      /doesn't match/,
    );
    expect(await reasonOf({ text, head: { ...baseFiles, [timerSpec]: "# x\n" } })).toMatch(
      /doesn't match/,
    );
    expect(await reasonOf({ text, head: { ...baseFiles, "README.md": "new" } })).toBe("approved");
  });

  test("binds the tests that verify a covered requirement, so removing one breaks the signature", async () => {
    const extra = "packages/core/workflow/src/extra.test.ts";
    const verifying = `import { verifies } from "@halonicjs/testing-spec";\nverifies("workflow.timer-fires", () => {});\n`;
    const files = { ...baseFiles, [extra]: verifying };
    const text = signed(note(), files, cto.privatePem);
    expect(await reasonOf({ text, head: files, base: files })).toBe("approved");
    expect(await reasonOf({ text, head: baseFiles })).toMatch(/doesn't match/);
    expect(await reasonOf({ text, head: { ...files, [extra]: "" } })).toMatch(/doesn't match/);
  });

  test("covers a top-level file named without a slash by its contents", async () => {
    const files = { ...baseFiles, "turbo.json": "{}" };
    const text = signed(`${note()}- turbo.json\n`, files, cto.privatePem);
    expect(await reasonOf({ text, head: files, base: files })).toBe("approved");
    const edited = { ...files, "turbo.json": '{"x":1}' };
    expect(await reasonOf({ text, head: edited, base: files })).toMatch(/doesn't match/);
  });

  test("rejects a key the pull request adds to approvers.json itself", async () => {
    const own = { ...baseFiles, [approversFile]: approvers({ internal: [stranger.publicKey] }) };
    const text = signed(note(), own, stranger.privatePem);
    expect(await reasonOf({ text, head: own })).toMatch(/isn't in the merge base's/);
  });

  test("rejects an internal key on a user-visible note", async () => {
    const text = signed(note("user-visible"), baseFiles, cto.privatePem);
    expect(await reasonOf({ text })).toMatch(/may only sign internal notes/);
  });

  test("rejects a key the base removed from approvers.json after signing", async () => {
    const text = signed(note(), baseFiles, cto.privatePem);
    const removed = { ...baseFiles, [approversFile]: approvers({}) };
    expect(await reasonOf({ text, base: removed })).toMatch(/isn't in the merge base's/);
  });

  test("rejects a signed note the base branch already has", async () => {
    const text = signed(note(), baseFiles, cto.privatePem);
    expect(await reasonOf({ text, base: { ...baseFiles, [noteFile]: text } })).toMatch(
      /already on the base branch/,
    );
  });

  test("fails closed without the pull request's details or commits", async () => {
    const text = signed(note(), baseFiles, cto.privatePem);
    expect(await reasonOf({ text, pull: undefined })).toMatch(/wasn't given the pull request/);
    expect(await reasonOf({ text, pull: { ...pull, base: "c".repeat(40) } })).toMatch(/can't read/);
  });
});

verifies("check.guard-signed-notes", () => {
  const line = signatureLine("x", cto.privatePem);
  test.each([
    ["no signature", note(), /no signature line/],
    ["two signature lines", note().replace("- Kind", `${line}\n${line}\n- Kind`), /more than one/],
    ["a signature below the header", `${note()}\n${line}\n`, /isn't in the note's header/],
    ["a carriage return", note().replace("\n", "\r\n"), /carriage return/],
    [
      "a malformed signature",
      note().replace("- Kind", "- Signature: ed25519:abc\n- Kind"),
      /isn't "- Signature/,
    ],
  ])("rejects a note with %s", (_case, text, reason) => {
    const split = splitSignature(text);
    expect(split.ok ? "ok" : split.reason).toMatch(reason);
  });
});
