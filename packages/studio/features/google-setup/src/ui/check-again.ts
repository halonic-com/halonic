import type { CheckAgainAnswer } from "../api.ts";

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
      return "Studio couldn't reach Google to check. Check your connection, then check again.";
    case "not-checked":
      return "Couldn't check just now. Try again in a moment.";
  }
}
