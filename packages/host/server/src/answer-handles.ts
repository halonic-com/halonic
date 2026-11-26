import type { HandleOf, WaitingPoint } from "@halonicjs/events";
import { maxAnswerMessageLength } from "@halonicjs/events";
import { encodeBase64url } from "@halonicjs/std";
import type { AnswerHandleStore, StoredAnswer } from "./many-users-api.ts";

/** The random bytes of one handle: 256 bits, so a handle can't be guessed. */
const handleBytes = 32;

/** The longest handle the answer route reads; a made one is 46 characters. */
export const maxHandleLength = 64;

/** The events the engine takes for an approval, as `askForApproval` waits for them. */
const approvalEvents = { approved: "approve", rejected: "reject" } as const;

/** A new answer handle from Web Crypto: an `ah_` prefix and 32 random bytes, base64url. */
export function newHandle(): string {
  return `ah_${encodeBase64url(crypto.getRandomValues(new Uint8Array(handleBytes)))}`;
}

/** Names a waiting point within one wait, so a later wait at the same step gets new handles. */
export function pointKeyOf(point: WaitingPoint, waitingSince: string): string {
  switch (point.kind) {
    case "approval":
      return JSON.stringify(["approval", point.callId, waitingSince]);
    case "question":
      return JSON.stringify(["question", point.state, waitingSince, ...point.events]);
    case "message":
      return JSON.stringify(["message", point.state, waitingSince, point.event]);
  }
}

/**
 * The handles of a run's waiting points, stored first, as a lookup `toRunView` can call. Two
 * readers of one wait get the same handles; a point of a wait gets one only once it is asked.
 *
 * @param waitingSince - the run summary's `lastWaitingAt`
 */
export async function handlesFor(
  store: AnswerHandleStore,
  runId: string,
  points: readonly WaitingPoint[],
  waitingSince: string,
): Promise<HandleOf> {
  const handles = new Map<string, string>();
  for (const point of points) {
    const key = pointKeyOf(point, waitingSince);
    const answer: StoredAnswer = { point, waitingSince };
    handles.set(key, await store.claim(runId, key, newHandle(), answer));
  }
  return (point) => {
    const handle = handles.get(pointKeyOf(point, waitingSince));
    // `toRunView` asks for exactly the points `waitingPointsOf` gave, so a miss is a bug here.
    if (handle === undefined) throw new Error("A waiting point was asked for without its handle.");
    return handle;
  };
}

/** The one field a payload object has, or `undefined` when it has another shape. */
function onlyField(payload: unknown, name: string): unknown {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return undefined;
  const keys = Object.keys(payload);
  if (keys.length !== 1 || keys[0] !== name) return undefined;
  return (payload as Record<string, unknown>)[name];
}

/**
 * What the engine is sent for an end user's answer with a stored handle: the event, its payload
 * and the call or wait it answers, so the engine refuses it once that has moved on. `null` when
 * the payload doesn't have the shape the handle's schema gives.
 */
export function sendBodyOf(answer: StoredAnswer, payload: unknown): Record<string, unknown> | null {
  const { point, waitingSince } = answer;
  if (point.kind === "approval") {
    const approved = onlyField(payload, "approved");
    if (typeof approved !== "boolean") return null;
    const event = approved ? approvalEvents.approved : approvalEvents.rejected;
    return { event, callId: point.callId };
  }
  const wait = { state: point.state, since: waitingSince };
  if (point.kind === "question") {
    const choice = onlyField(payload, "choice");
    if (!Number.isSafeInteger(choice) || typeof choice !== "number") return null;
    const event = point.events[choice];
    return event === undefined ? null : { event, wait };
  }
  const text = onlyField(payload, "text");
  if (typeof text !== "string" || text.length === 0 || text.length > maxAnswerMessageLength) {
    return null;
  }
  return { event: point.event, payload: { text }, wait };
}
