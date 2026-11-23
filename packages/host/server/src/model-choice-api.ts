import type { ModelChoiceService } from "@halonicjs/app";

/**
 * The first run's model choice (first-run-flow 3.3) behind `/api/model-choice/…`, so a browser on
 * `halonic serve` can test and save a model choice the way the desktop app does (HAL-14808). The
 * service runs on the computer: the browser only sends what a person picked and pasted.
 *
 * A passed test holds its key in memory until Continue, so the host keeps one service per session
 * and the server keeps none: no state in module memory, and one session can never continue
 * another's test. The host may forget a session's service at any time, such as after a while
 * unused; that session's test then has to run again.
 *
 * The host's service must not grant trust: the routes always pass `undefined` as the shown
 * fingerprint, so trust stays a step at the computer (HAL-14808, D2).
 */
export interface ModelChoicePort {
  /**
   * The model choice of one signed-in session.
   *
   * @param session The session's id: the SHA-256 of its token, never the token, or
   *   `"this-computer"` on a server with no password, which answers only on loopback.
   */
  forSession(session: string): ModelChoiceService;
}
