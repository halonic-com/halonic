import type { RefusalCode } from "./integration/index.ts";

/**
 * The refusal codes that mean the integration tried to get a secret out:
 * it carried a secret value in its own request, or it asked the kit to
 * place a secret somewhere its permission sheet doesn't say. A connector
 * that gets one of these should be paused, not just shown the error. Every
 * other code is an ordinary mistake, such as a host the sheet doesn't list
 * or a body that is too large, or comes from the server, such as
 * `secret-in-redirect` for a redirect whose URL holds a secret.
 *
 * @example
 * if (leakAttemptCodes.includes(error.code)) pauseConnector(); // "secret-in-request"
 */
export const leakAttemptCodes: readonly RefusalCode[] = Object.freeze([
  "secret-in-request",
  "placement-not-in-sheet",
]);
