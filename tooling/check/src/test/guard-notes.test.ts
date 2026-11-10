import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { signedApprovals } from "../guard/approvals.ts";
import { parseDecisionNote } from "../guard/decision-notes.ts";
import type { GuardCheck } from "../guard/finding.ts";
import type { GitObjects } from "../guard/signatures.ts";
import { noteCovering, noteFile, runGuard } from "./guard-fixture.ts";

const file = "packages/core/workflow/requirements/timer-fires.md";
/** A check that always finds one change, standing in for the real ones. */
const findsAnEdit: GuardCheck = () => [
  {
    subject: "workflow.timer-fires",
    file,
    message: 'The active requirement "workflow.timer-fires" was edited.',
  },
];
const edited = { base: {}, head: {}, checks: [findsAnEdit] };

verifies("check.guard-needs-approved-note", () => {
  test("fails without a decision note, and names the note to add", async () => {
    const { errors } = await runGuard(edited);
    expect(errors).toEqual([
      `${file}: The active requirement "workflow.timer-fires" was edited. That needs a decision note: add ${noteFile}, list "workflow.timer-fires" under Covers, link an approval and have the approver sign it (plan 9.3).`,
    ]);
  });

  test("passes when the note lists the change and its approval is verified", async () => {
    const outcome = await runGuard({ ...edited, note: noteCovering("workflow.timer-fires") });
    expect(outcome.errors).toEqual([]);
    expect(outcome.warnings).toEqual([
      `${file}: The active requirement "workflow.timer-fires" was edited. Allowed by ${noteFile} (https://paperclip.example/HAL/approvals/1234).`,
    ]);
  });

  test("fails when the note doesn't list the change", async () => {
    const { errors } = await runGuard({ ...edited, note: noteCovering("workflow.other") });
    expect(errors).toEqual([
      `${file}: The active requirement "workflow.timer-fires" was edited. ${noteFile} doesn't list "workflow.timer-fires" under Covers.`,
    ]);
  });

  test("fails when the note's approval isn't verified", async () => {
    const note = noteCovering("workflow.timer-fires");
    const { errors } = await runGuard({ ...edited, note, approved: false });
    expect(errors).toEqual([
      `${file}: The active requirement "workflow.timer-fires" was edited. ${noteFile} covers it, but its approval isn't verified: the approval is for another branch.`,
    ]);
  });

  test("fails when the note is malformed, and points at the line to fix", async () => {
    const note = noteCovering("workflow.timer-fires").replace("- Kind: internal", "- Kind: big");
    const { errors } = await runGuard({ ...edited, note });
    expect(errors).toEqual([
      `${noteFile}: Malformed decision note: Add "- Kind: user-visible" or "- Kind: internal" (D13).`,
      `${file}: The active requirement "workflow.timer-fires" was edited. ${noteFile} can't be read, see its errors.`,
    ]);
  });

  test("passes without a note when nothing needs one", async () => {
    const findsNothing: GuardCheck = () => [];
    const outcome = await runGuard({ base: {}, head: {}, checks: [findsNothing] });
    expect(outcome).toEqual({ errors: [], warnings: [] });
  });
});

verifies("check.guard-approval-fails-closed", () => {
  const parsed = parseDecisionNote(noteFile, noteCovering("workflow.timer-fires"));
  const note = parsed.ok ? parsed.note : undefined;
  /** A repo that has every commit and file, so only the missing inputs can fail. */
  const everything: GitObjects = {
    hasCommit: () => true,
    objectId: () => "0".repeat(40),
    listFiles: () => [],
    readFile: () => "",
  };
  const pull = {
    repo: "halonic-com/halonic",
    number: 7,
    head: "a".repeat(40),
    base: "b".repeat(40),
  };

  test("verifies no approval without the pull request's details", async () => {
    const verdict = note && (await signedApprovals(undefined, everything).check({ note }));
    expect(verdict).toMatchObject({ approved: false, reason: /wasn't given the pull request/ });
  });

  test("verifies no approval when the base commit can't be read", async () => {
    const withoutBase = { ...everything, hasCommit: (commit: string) => commit === pull.head };
    const verdict = note && (await signedApprovals(pull, withoutBase).check({ note }));
    expect(verdict).toMatchObject({ approved: false, reason: /can't read/ });
  });
});
