import { findSecretShape, type SecretShape } from "@halonicjs/std";

/** Why a message is held, and what the line under the box says about it. */
export interface SecretHold {
  readonly shape: SecretShape;
  /** The sentence under the box. It names the kind, never the text that matched. */
  readonly line: string;
}

const keptInRunLog = "Messages are kept in the run log.";

/** The line for each kind. Only a Google client secret has a field in the Google setup. */
function lineFor(shape: SecretShape): string {
  if (shape === "google-client-secret") {
    return `This looks like a Google client secret. ${keptInRunLog} Put it in the secret field of the Google setup instead.`;
  }
  return `This looks like a secret key. ${keptInRunLog} Put it in Providers instead.`;
}

/**
 * Whether a message looks like it holds a secret, so a note or chat message is held before it
 * is sent: the run log keeps every message. The answer carries no part of the text, so a screen
 * can show it and a log can keep it without leaking the key.
 *
 * @example
 * secretHold("Use the shorter title"); // undefined
 */
export function secretHold(text: string): SecretHold | undefined {
  const shape = findSecretShape(text);
  return shape === undefined ? undefined : { shape, line: lineFor(shape) };
}
