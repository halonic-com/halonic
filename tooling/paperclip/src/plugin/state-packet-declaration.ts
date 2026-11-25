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
} as const;
