import type { ServerConfig, ServerPorts } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";

const msPerDay = 24 * 60 * 60 * 1000;

/**
 * Counts this request against `limits.dailyRequests`. It answers `null` when
 * the request is within the ceiling, or when the deployment sets none. Past
 * the ceiling it answers 429 with a `Retry-After` up to the next UTC midnight.
 * Only a request that proved who sent it is counted: a signed-in one or a
 * signed webhook delivery. Anything else is not, so a caller who can't sign
 * in can't use up the day for those who can.
 */
export async function checkDailyRequests(
  config: Pick<ServerConfig, "dailyRequests">,
  ports: Pick<ServerPorts, "requestCounts" | "clock">,
): Promise<Response | null> {
  if (config.dailyRequests === undefined) {
    return null;
  }
  const now = ports.clock.now();
  const day = now.toISOString().slice(0, 10);
  const { allowed } = await ports.requestCounts.countRequest(day, config.dailyRequests);
  if (allowed) {
    return null;
  }
  return errorResponse(serverErrors.dailyLimitReached, {
    "retry-after": String(secondsUntilNextUtcDay(now)),
  });
}

function secondsUntilNextUtcDay(now: Date): number {
  const nextMidnight = (Math.floor(now.getTime() / msPerDay) + 1) * msPerDay;
  return Math.ceil((nextMidnight - now.getTime()) / 1000);
}

/** Counts the current request against the daily ceiling: `null` within it, the 429 answer past it. */
export type CountRequest = () => Promise<Response | null>;
