import type { StepperRisk } from "@halonicjs/action-steppers";

/** An invented `user` header: sets one variable on each of several repos. */
export const acmeUserHeader = {
  format: "halonic.toolscript/1",
  id: "acme.sync-release-variables",
  version: 1,
  audience: "user",
  title: "Sync release variables",
  summary: "Sets one variable on each listed repository.",
  risk: "admin",
  inputs: {
    repos: {
      type: "list",
      items: { type: "string", pattern: "^acme/[a-z-]{1,40}$" },
      max: 10,
      description: "The repositories to change.",
    },
    name: { type: "string", pattern: "^[A-Z_]{1,40}$", description: "The variable's name." },
    token: { type: "string", pattern: "^.{1,200}$", secret: true, description: "A token." },
  },
  uses: ["acme.set-variable@1"],
  touches: { "acme.set-variable@1": { repo: "{input.repos[]}", name: "{input.name}" } },
  guide: { intro: "Changes {input.name} on each repository." },
} as const;

/** An invented `agent` header that comments on a task. */
export const acmeAgentHeader = {
  format: "halonic.toolscript/1",
  id: "acme.comment-on-task",
  version: 1,
  audience: "agent",
  title: "Comment on a task",
  summary: "Posts one comment on a task.",
  risk: "routine",
  inputs: { task: { type: "string", pattern: "^ACME-[0-9]{1,6}$", description: "The task." } },
  uses: ["acme.comment@1"],
  tool: { name: "comment_on_task", description: "Posts one comment on a task." },
} as const;

/** The invented registry's risks. */
export const acmeRisks: Readonly<Record<string, StepperRisk>> = {
  "acme.set-variable@1": "admin",
  "acme.comment@1": "routine",
  "acme.delete-zone@1": "irreversible",
};

/** A copy of a header with changes, as plain data a test can break on purpose. */
export function changed(header: object, changes: Record<string, unknown>): Record<string, unknown> {
  return { ...header, ...changes };
}
