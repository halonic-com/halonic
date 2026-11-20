import type { CheckAgainAnswer, CheckAgainEntry } from "../api.ts";

/**
 * What step 7 says under **Check again** where the host can't check yet (rule N5, HAL-12363). The
 * `halonic google sign-in` command follows it in a box.
 */
export function signInAgainText(
  where: Extract<CheckAgainEntry, { kind: "sign-in-again" }>["where"],
): string {
  const place = where === "terminal" ? "in a terminal" : "on your computer";
  return `Studio can't check these again yet. To check them, sign in again ${place}:`;
}

/**
 * What step 7 says after **Check again** when it found nothing new, or `null` when the check ran
 * and the results on the record say the rest. Nothing here repeats text from Google.
 */
export function checkAgainText(answer: CheckAgainAnswer): string | null {
  switch (answer.kind) {
    case "checked":
      return null;
    case "sign-in-refused":
      return "Google no longer accepts this sign-in. Sign in again.";
    case "client-refused":
      return "Google doesn't accept the saved client ID or secret. Check them in step 6, then sign in again.";
    case "no-network":
      return "Halonic couldn't reach Google to check. Check your connection, then check again.";
    case "not-checked":
      return "Couldn't check just now. Try again in a moment.";
  }
}
