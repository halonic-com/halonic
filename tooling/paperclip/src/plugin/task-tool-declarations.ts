import type { PluginToolDeclaration } from "@paperclipai/plugin-sdk";

/**
 * How the manifest declares the task tools (HAL-16403): what an agent reads
 * about each one before it calls it. Kept beside the manifest so it stays
 * under the file size limit.
 */

const taskParam = {
  type: "string",
  description: "The task's identifier, such as HAL-16403, or its id.",
} as const;

const commentParam = {
  type: "string",
  description:
    "Posted with the change, as you: what happened and what comes next. At most 20,000 characters.",
} as const;

const blockedByParam = {
  type: "array",
  items: { type: "string" },
  minItems: 1,
  maxItems: 10,
  description:
    "The tasks that hold the work (the one with the PR or the decision), such as HAL-16989; never a parent epic.",
} as const;

/** The three task tools: one that comments, two that change a task's state. */
export const taskToolDeclarations: PluginToolDeclaration[] = [
  {
    name: "comment",
    displayName: "Comment on a task",
    description:
      "Posts one comment on a task, with you as its author. It wakes nobody, not even the task's holder: to hand a task on, assign it. At most 20,000 characters; a longer text belongs in a document.",
    parametersSchema: {
      type: "object",
      properties: {
        task: taskParam,
        body: { type: "string", description: "The comment, in Markdown." },
      },
      required: ["task", "body"],
    },
  },
  {
    name: "set_next_step",
    displayName: "Set the task's next step",
    description:
      "Keeps the task you are running on yours and in a state Paperclip accepts, with a comment, in one call: in_progress with a monitor that wakes you (for example 20 minutes after a push), or blocked by the tasks that hold the work. It never hands a task on: use finish_run for that. Paperclip's own rules decide; a refusal comes back with its reason.",
    parametersSchema: {
      type: "object",
      properties: {
        task: taskParam,
        status: { type: "string", enum: ["in_progress", "blocked"] },
        monitor: {
          type: "object",
          description: "For in_progress: when to wake you and what you are waiting on.",
          properties: {
            inMinutes: {
              type: "integer",
              minimum: 15,
              maximum: 1440,
              description:
                "Minutes until the first check, such as 20 after a push or 360 after approval.",
            },
            ref: {
              type: "string",
              description: "What you wait on, such as halonic-com/halonic#5486.",
            },
            service: { type: "string", description: "Where it runs; github by default." },
            maxChecks: {
              type: "integer",
              minimum: 1,
              maximum: 8,
              description: "How many checks at most; 4 by default.",
            },
          },
          required: ["inMinutes", "ref"],
        },
        blockedBy: blockedByParam,
        comment: commentParam,
      },
      required: ["task", "status", "comment"],
    },
  },
  {
    name: "finish_run",
    displayName: "Finish your run on the task",
    description:
      "Ends your work on the task you are running, with a comment, in one call: done, handoff to the next agent (status todo, which wakes them; your monitor is removed), or blocked by the tasks that hold the work. Call it last: a handoff stops your run at once, so push and comment before it.",
    parametersSchema: {
      type: "object",
      properties: {
        task: taskParam,
        outcome: { type: "string", enum: ["done", "handoff", "blocked"] },
        to: {
          type: "string",
          description: "For handoff: the next agent's name or url key, such as Liam.",
        },
        blockedBy: blockedByParam,
        comment: commentParam,
      },
      required: ["task", "outcome", "comment"],
    },
  },
];
