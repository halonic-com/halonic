/**
 * The state packet's setting in the plugin's settings (HAL-17402). Off by
 * default: the board turns it on for the 48-hour trial, and off again to roll
 * it back. Kept apart so the manifest stays short.
 */
export const statePacketConfigProperties = {
  statePacket: {
    type: "boolean",
    title: "State packet in monitor wakes",
    description:
      "On: before a monitor wake's run starts on a task with a pull request on an <agent>/HAL-<n>-<words> branch, the run gets a short packet with its pull requests' status and the task's 3 newest comments. Needs the server patch from HAL-18684. Off: no packet, the wake is as before.",
    default: false,
  },
  wakeGate: {
    type: "string",
    enum: ["off", "measure"],
    title: "Wake gate for monitor wakes",
    description:
      "measure: on each monitor wake of a task with a pull request on an <agent>/HAL-<n>-<words> branch, log and count whether the run would have been skipped because every pull request waits on someone else and nobody else commented (HAL-18985). The wake always starts. off: nothing is logged.",
    default: "off",
  },
} as const;
