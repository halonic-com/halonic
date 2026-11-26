import type { PluginJobDeclaration } from "@paperclipai/plugin-sdk";

/**
 * The Merger wake's job and settings in the manifest (HAL-19234,
 * src/plugin/merger-wake.ts). Kept here so `manifest.ts` stays within the
 * file-size limit.
 */

/** The `merger-wake` job. */
export const mergerWakeJob: PluginJobDeclaration = {
  jobKey: "merger-wake",
  displayName: "Merger wake",
  description:
    "Every minute, when it is on: reads the open pull requests' head, base, review decision, checks and labels, and wakes the Merger on its own task when one changed, at most once every 45 seconds and not while a Merger run is in progress.",
  schedule: "* * * * *",
};

/** The Merger wake's settings. */
export const mergerWakeConfigProperties = {
  mergerWake: {
    type: "object",
    title: "Merger wake",
    properties: {
      enabled: {
        type: "boolean",
        title: "On",
        description:
          "On: a change to an open pull request on the first repository (head, base, review decision, checks, labels, opened or closed) or a signed approval wakes the Merger on the task below. Off: nothing is read and nobody is woken; the Merger's own heartbeat goes on either way.",
        default: false,
      },
      task: {
        type: "string",
        title: "The Merger's task",
        description:
          "The id of an open task assigned to the Merger. The wake goes there, so the woken run is the Merger's own. Empty: the wake is off.",
      },
    },
  },
};
