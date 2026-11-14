import { findSecretShape, type SecretShape } from "@halonicjs/std";

/** Why a message is held, and what the line under the box says about it. */
export interface SecretHold {
  readonly shape: SecretShape;
  /** The sentence under the box. It names the kind, never the text that matched. */
  readonly line: string;
}

const keptInRunLog = "Messages are kept in the run log.";

/**
 * Whether the Google setup has a secret field to point to: step 6, the client ID and secret
 * (HAL-713). A line must not point at a field that isn't there, so until it lands the Google line
 * stops after the run log sentence (microcopy 10.2). Switch it on with step 6's body.
 */
const GOOGLE_SECRET_FIELD_EXISTS = false;

/** Where Studio runs: the Google setup and Providers can't be reached from a phone (10.4). */
export interface SecretHoldWhere {
  readonly phone?: boolean;
}

/** The line for each kind (microcopy 10.2). Only a Google client secret has a field in the Google setup. */
function lineFor(shape: SecretShape, where: SecretHoldWhere): string {
  const onComputer = where.phone === true ? " on your computer" : "";
  if (shape === "google-client-secret") {
    const found = `This looks like a Google client secret. ${keptInRunLog}`;
    if (!GOOGLE_SECRET_FIELD_EXISTS) return found;
    return `${found} Put it in the secret field of the Google setup${onComputer} instead.`;
  }
  return `This looks like a secret key. ${keptInRunLog} Put it in Providers${onComputer} instead.`;
}

/**
 * Whether a message looks like it holds a secret, so a note or chat message is held before it
 * is sent: the run log keeps every message. The answer carries no part of the text, so a screen
 * can show it and a log can keep it without leaking the key.
 *
 * @example
 * secretHold("Use the shorter title"); // undefined
 */
export function secretHold(text: string, where: SecretHoldWhere = {}): SecretHold | undefined {
  const shape = findSecretShape(text);
  return shape === undefined ? undefined : { shape, line: lineFor(shape, where) };
}
