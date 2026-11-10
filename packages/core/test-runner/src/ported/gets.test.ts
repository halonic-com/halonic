// The old runner's gets suite, through `runWorkspaceTests`: steps pick their
// data with `gets` instead of {{…}} in the prompt.

import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runWorkspaceTests } from "../run-tests.ts";
import { promptsOf, recordingDeps } from "../test/fakes.ts";
import { agent, testFile, testInput, workflow } from "../test/workspaces.ts";

// The second step has no input of its own, so it sends only the data it
// picks, not the whole run input (`workflow.state-input`, HAL-4455).
const mail = workflow(
  "mail",
  `id: mail
name: Mail
initial: tag
states:
  tag: { type: task, agent: a, input: "Tag this mail.", gets: [input.message], output: tags, on: [{ to: check }] }
  check: { type: task, agent: a, gets: [input.message, context.tags], output: check, on: [{ to: reply }] }
  reply: { type: task, agent: a, input: "Reply.", gets: [input.from, context.tags], on: [{ to: end }] }
  end: { type: final }
`,
);

verifies("test-runner.old-suites", () => {
  describe("picked data (gets)", () => {
    it("sends each prompt with only the values it picks", async () => {
      const input = await testInput(
        agent("a"),
        mail,
        testFile(
          "mail",
          `workflow: mail
cases:
  - name: tags and replies
    input: { message: The school trip is on Friday., from: school@example.com, secret: not sent }
    mocks: { a: [school, Looks right., Done] }
    expect: { final: end, context: { tags: school, check: Looks right. } }
`,
        ),
      );
      const { deps, models } = recordingDeps();

      const [test] = (await runWorkspaceTests(input, deps)).tests;

      expect(test?.failures).toEqual([]);
      expect(promptsOf(models[0])).toEqual([
        ["a", "Tag this mail.\n\n## Data\n\n### input.message\nThe school trip is on Friday."],
        [
          "a",
          "## Data\n\n### input.message\nThe school trip is on Friday.\n\n### context.tags\nschool",
        ],
        [
          "a",
          "Reply.\n\n## Data\n\n### input.from\nschool@example.com\n\n### context.tags\nschool",
        ],
      ]);
    });
  });
});
