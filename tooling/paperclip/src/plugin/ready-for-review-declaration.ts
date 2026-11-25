import type { PluginJobDeclaration, PluginToolDeclaration } from "@paperclipai/plugin-sdk";

/**
 * How the manifest declares `ready_for_review` (HAL-16437) and the job that
 * wakes a task when its check is done (HAL-18980). Kept beside the manifest
 * so it stays under the file size limit.
 */

/** The `ready_for_review` tool. */
export const readyForReviewDeclaration: PluginToolDeclaration = {
  name: "ready_for_review",
  displayName: "Ready for review",
  description:
    "Call before you open or update a pull request on halonic-com/halonic: checks your pushed branch merged into current main (repo checks, format, generated files, typecheck and lint, affected tests, coverage floors) and answers PASS, FAIL with a short summary per failed step, RUNNING, or CHECK UNAVAILABLE. On FAIL, fix, push and call it again; on PASS or CHECK UNAVAILABLE, go on. On RUNNING for a branch named <agent>/HAL-<n>-<words> of a task you hold, don't call it again: the plugin posts the answer on that task and wakes you there. CI still has the final say.",
  parametersSchema: {
    type: "object",
    properties: {
      branch: {
        type: "string",
        description: "The branch you pushed, for example mateo/HAL-16437-ready-for-review.",
      },
      sha: {
        type: "string",
        description:
          "Optional: the full 40-character commit you pushed, so a stale push fails at once.",
      },
      checkId: {
        type: "string",
        description:
          "Only when a RUNNING answer asked for it (a branch without a task to wake): reads that check instead of starting a new one.",
      },
    },
  },
};

/** The `precheck-wake` job. */
export const precheckWakeJob: PluginJobDeclaration = {
  jobKey: "precheck-wake",
  displayName: "Precheck wake",
  description:
    "Every minute: reads each check ready_for_review answered RUNNING for, and when it is done, or still running after 30 minutes, posts the answer on the branch's task and wakes it once. Does nothing while no check is waited on.",
  schedule: "* * * * *",
};
