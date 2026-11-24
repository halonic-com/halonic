import { isSafeSegment, UnsafeIdError } from "./requests.ts";

/**
 * The whole list of requests a Paperclip sign-in may send, apart from the
 * messaging list (`requests.ts`). Starting a challenge makes a board key, so
 * it can't be on the messaging list (board, HAL-10, 24 Nov); the board's
 * exception for sign-in is this separate list, which only the engine's
 * sign-in flow uses (HAL-17439). None of these requests carries a key: a
 * challenge is read and cancelled with its own secret. A new entry needs a
 * security review.
 */
export const paperclipSignInRequests = {
  createChallenge: { method: "POST", path: "/api/cli-auth/challenges" },
  pollChallenge: { method: "GET", path: "/api/cli-auth/challenges/:challenge" },
  cancelChallenge: { method: "POST", path: "/api/cli-auth/challenges/:challenge/cancel" },
} as const satisfies Record<string, { method: "GET" | "POST"; path: string }>;

/** The name of one request on {@link paperclipSignInRequests}. */
export type PaperclipSignInRequestName = keyof typeof paperclipSignInRequests;

/**
 * The path of sign-in request `name` for challenge `challengeId`. Throws
 * {@link UnsafeIdError} when the ID can't be one path segment.
 */
export function signInPath(name: PaperclipSignInRequestName, challengeId?: string): string {
  const { path } = paperclipSignInRequests[name];
  if (!path.includes(":challenge")) {
    return path;
  }
  if (challengeId === undefined || !isSafeSegment(challengeId)) {
    throw new UnsafeIdError("challenge");
  }
  return path.replace(":challenge", encodeURIComponent(challengeId));
}

/**
 * The sign-in request that `method` and `path` match, or `undefined`. Tests
 * use it to check that every sign-in request a fake server saw was allowed.
 */
export function findSignInRequest(
  method: string,
  path: string,
): PaperclipSignInRequestName | undefined {
  const names = Object.keys(paperclipSignInRequests) as PaperclipSignInRequestName[];
  return names.find((name) => {
    const request = paperclipSignInRequests[name];
    const patternParts = request.path.split("/");
    const parts = path.split("/");
    if (request.method !== method || patternParts.length !== parts.length) {
      return false;
    }
    return patternParts.every((patternPart, index) => {
      const part = parts[index] ?? "";
      return patternPart.startsWith(":") ? isSafeSegment(part) : patternPart === part;
    });
  });
}
