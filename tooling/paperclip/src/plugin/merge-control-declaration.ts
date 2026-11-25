import type { PluginJobDeclaration } from "@paperclipai/plugin-sdk";

/**
 * Merge control's job in the manifest (ADR on HAL-17700). Its settings are in
 * `queue-settings.ts`. Kept here so `manifest.ts` stays within the file-size limit.
 */

/** The `merge-control` job. */
export const mergeControlJob: PluginJobDeclaration = {
  jobKey: "merge-control",
  displayName: "Merge control",
  description:
    "Every minute, when its mode isn't off: reads the merge queue's facts from GitHub and the CI server and decides what the queue needs. Shadow mode writes nothing and posts a daily diff with the Merger's actions.",
  schedule: "* * * * *",
};
