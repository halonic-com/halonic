import { KindedError } from "@halonicjs/std";

/**
 * A refusal, `unavailable`, whose next step is to wait for something that ends by itself, such as
 * a run that's going. Starting again then works, so a screen shows the step with **Try again**, as
 * it does for a `conflict` (`startFailureOf`, design check C701 row 4).
 *
 * @example
 * new TryAgainLater("Local only was turned on in Acme while a run was going.", "Try again once that run ends.");
 */
export class TryAgainLater extends KindedError {
  /**
   * @param message the reason, a sentence that names what is going
   * @param fix the next step, which says what to wait for
   */
  constructor(message: string, fix: string) {
    super("unavailable", message, { fix });
  }
}
