import type { PluginToolDeclaration } from "@paperclipai/plugin-sdk";
import { verdictKinds } from "../verdicts/record.ts";

/**
 * The `review_verdict` tool's declaration and setting (HAL-19481), split
 * from `manifest.ts` to keep it under the size limit.
 */

/** The reviewers' agents: only these may record verdicts. The board sets them. */
export const reviewVerdictConfigProperties = {
  verdictReviewers: {
    type: "object",
    title: "Verdict reviewers",
    description:
      "The agent id of each reviewer who may record verdicts with review_verdict. Nobody else can; empty means the tool refuses every call.",
    properties: {
      liam: { type: "string", title: "Liam's agent id" },
      julian: { type: "string", title: "Julian's agent id" },
      nora: { type: "string", title: "Nora's agent id" },
    },
    additionalProperties: false,
  },
  verdictGate: {
    type: "boolean",
    title: "Gates read the recorded verdicts",
    description:
      "The board's flag (HAL-19969): when on, the merge gate and pr_status count only recorded verdicts (review_verdict), never PR comments. Off by default: the gates read PR comments as before.",
    default: false,
  },
} as const;

/** Whether the board turned the gates over to the recorded verdicts; anything but `true` is off. */
export function verdictGateOn(config: Readonly<Record<string, unknown>>): boolean {
  return config["verdictGate"] === true;
}

/** The agent id of each reviewer the settings name, by lower-case name; empty when they name none. */
export function verdictReviewerIds(
  config: Readonly<Record<string, unknown>>,
): Record<string, string> {
  const named = config["verdictReviewers"];
  if (typeof named !== "object" || named === null) {
    return {};
  }
  const known = Object.keys(reviewVerdictConfigProperties.verdictReviewers.properties);
  return Object.fromEntries(
    Object.entries(named).filter(
      (entry): entry is [string, string] =>
        known.includes(entry[0]) && typeof entry[1] === "string" && entry[1] !== "",
    ),
  );
}

/** The reviewer the settings name for this agent id, or undefined when they name none. */
export function verdictReviewerOf(
  config: Readonly<Record<string, unknown>>,
  agentId: string,
): string | undefined {
  return Object.entries(verdictReviewerIds(config)).find(([, id]) => id === agentId)?.[0];
}

/** The `review_verdict` tool. */
export const reviewVerdictDeclaration: PluginToolDeclaration = {
  name: "review_verdict",
  displayName: "Record my review verdict",
  description:
    "Records your verdict on a pull request's exact head: approved, changes-requested, withdrawn (takes back your own change request) or security-ok (Julian only). Only the reviewers' agents, from a run that holds the pull request's task (the one its branch names, or a review task that links it and names its branch). It checks who wrote the pull request and the review rules, records the verdict, and posts its line on the task as you. Post the same line on the pull request yourself.",
  parametersSchema: {
    type: "object",
    properties: {
      pr: { type: "integer", description: "The pull request's number." },
      repo: {
        type: "string",
        description: "owner/name, one of the plugin's repositories; the first one by default.",
      },
      task: { type: "string", description: "The task your run holds, such as HAL-16403." },
      verdict: { type: "string", enum: [...verdictKinds] },
      head: {
        type: "string",
        description: "The pull request's current head, all 40 characters.",
      },
    },
    required: ["pr", "task", "verdict", "head"],
  },
};
