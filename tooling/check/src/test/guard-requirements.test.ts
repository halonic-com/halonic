import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { checkRequirementChanges } from "../guard/requirement-changes.ts";
import { noteCovering, requirementText, runGuard } from "./guard-fixture.ts";

const checks = [checkRequirementChanges];
const name = "requirements/timer-fires.md";
const file = `packages/core/workflow/${name}`;
const active = { [name]: requirementText("timer-fires") };

async function errorsFor(head: Record<string, string>, base = active): Promise<string[]> {
  return (await runGuard({ base, head, checks })).errors;
}

verifies("check.guard-requirement-changes", () => {
  test.each([
    [
      "edited",
      { [name]: requirementText("timer-fires", "active", "The engine shall fire the timer.") },
    ],
    ["retired", { [name]: requirementText("timer-fires", "retired") }],
    ["demoted to draft", { [name]: requirementText("timer-fires", "draft") }],
    ["deleted or renamed", {}],
  ])("fails when an active requirement is %s", async (change, head) => {
    const errors = await errorsFor(head);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(
      new RegExp(`^${file}: The active requirement "workflow.timer-fires" was ${change}\\.`),
    );
  });

  test("names the new ID when a requirement was renamed", async () => {
    const renamed = requirementText("timer-goes-off").replace(
      "the timer-goes-off timer",
      "the timer-fires timer",
    );
    const errors = await errorsFor({ "requirements/timer-goes-off.md": renamed });
    expect(errors[0]).toMatch(/"workflow.timer-fires" was renamed to "workflow.timer-goes-off"\./);
  });

  test("passes a change the decision note covers", async () => {
    const head = { [name]: requirementText("timer-fires", "retired") };
    const note = noteCovering("workflow.timer-fires");
    expect((await runGuard({ base: active, head, note, checks })).errors).toEqual([]);
  });

  test("passes an unchanged requirement, and edits to draft and retired ones", async () => {
    expect(await errorsFor(active)).toEqual([]);
    const draft = { [name]: requirementText("timer-fires", "draft") };
    const retired = { [name]: requirementText("timer-fires", "retired") };
    const editedDraft = { [name]: `${requirementText("timer-fires", "draft")}\nMore.\n` };
    expect(await errorsFor(editedDraft, draft)).toEqual([]);
    expect(await errorsFor({}, retired)).toEqual([]);
  });
});
