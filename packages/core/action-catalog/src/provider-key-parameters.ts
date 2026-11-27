import type { TextParameter } from "@halonicjs/action-steppers";

// Shared by the provider key definitions (anthropic, cloudflare, google,
// openrouter). It sits next to the service folders, not in one, because every
// file in a service folder is a definition.

/**
 * The name the user gives a new key on the provider's page, so they can find
 * and revoke it later. Never the key itself: no definition has a parameter,
 * result or kept field that could hold one (task HAL-17553).
 */
export const keyName: TextParameter = {
  kind: "text",
  pattern: /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,
};

/**
 * The last instruction of every provider key step. The key is shown once; it
 * goes only where the stepper's next step says, which today is Paperclip's own
 * Secrets page (`paperclip.set-secret@1`), never Halonic's page or a chat.
 */
export const keepTheKeyLine =
  "Copy the key now: the page shows it only once. Paste it only where the next step of this stepper tells you, never into a chat, a task or a request.";
