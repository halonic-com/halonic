/**
 * The wake-hold's settings in the plugin's settings (HAL-19315). Off by
 * default; kept apart so the manifest stays short and doesn't load the
 * handler.
 */

/** The hold when the board set none. */
export const defaultHoldSeconds = 3;
/** The shortest and longest hold the setting allows; the server refuses more than 10 s. */
export const minHoldSeconds = 1;
export const maxHoldSeconds = 10;

/** The plugin settings the board sees for the wake-hold, spread into the manifest's schema. */
export const wakeHoldConfigProperties = {
  wakeHoldEnabled: {
    type: "boolean",
    title: "Front bot: combine message bursts into one run",
    description:
      "Off: a chat message wakes its agent at once. On: when no run is live on a chat task, the wake waits until no new message has come for the hold below, so a burst of messages becomes one run. Needs the server patch from HAL-19292, which never holds a message longer than 15 s.",
    default: false,
  },
  wakeHoldSeconds: {
    type: "integer",
    minimum: minHoldSeconds,
    maximum: maxHoldSeconds,
    title: "Front bot: hold after the newest message (seconds)",
    description: "A whole number from 1 to 10. Anything else counts as 3.",
    default: defaultHoldSeconds,
  },
} as const;
