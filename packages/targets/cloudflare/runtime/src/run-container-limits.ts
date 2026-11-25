// How long a run's container may run. One place, because the container's alarm, the bridge
// credential and (with HAL-18149) the spend guard all count from it.

/** The longest Cloudflare lets a Durable Object's alarm run, in milliseconds: 15 minutes. */
export const runObjectAlarmLimitMs = 15 * 60_000;

/** How long before the alarm limit the container must have ended, so stopping it fits in the alarm. */
const containerEndMarginMs = 60_000;

/**
 * The longest a harness step's container runs, in milliseconds: 14 minutes. A harness step runs
 * inside its run object's alarm, which Cloudflare stops at {@link runObjectAlarmLimitMs}, so the
 * container and its bridge credential end before that.
 */
export const runContainerTimeCapMs = runObjectAlarmLimitMs - containerEndMarginMs;
