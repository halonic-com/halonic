// The "picked data (gets)" workflow of the old tests (784f78d). The initial
// context names a team instead of the person the old file named.
import { workflowOf } from "./workflow.spec.ts";

/** The file of {@link mailWorkflow}, so a test can change one state and read it again. */
export const mailWorkflowFile = {
  id: "mail",
  name: "Mail",
  initial: "tag",
  context: { owner: "support-team" },
  states: {
    tag: { agent: "a", output: "tags", on: [{ to: "check" }] },
    check: {
      agent: "a",
      output: "check",
      gets: ["input.message", "context.tags"],
      on: [{ to: "reply" }],
    },
    reply: {
      agent: "a",
      gets: ["context.tags", "context.check", "context.owner"],
      on: [{ to: "end" }],
    },
    end: { type: "final" },
  },
};

/** Tag a mail, check it, reply: each step picks data the steps before it wrote. */
export const mailWorkflow = workflowOf(mailWorkflowFile);
