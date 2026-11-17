import { findSecretShape, type SecretShape } from "@halonicjs/std";

/** Why a message is held, and what the line under the box says about it. */
export interface SecretHold {
  readonly shape: SecretShape;
  /** The sentence under the box. It names the kind, never the text that matched. */
  readonly line: string;
}

const keptInRunLog = "Messages are kept in the run log.";

/** Where Studio runs: the Google setup and Providers can't be reached from a phone (10.4). */
export interface SecretHoldWhere {
  readonly phone?: boolean;
  /** Where a Google client secret belongs: an account's setup (the default), or a connector in the Library when no account waits. */
  readonly place?: "setup" | "connectors";
}

/** The line for each kind (microcopy 10.2). Only a Google client secret has a field in the Google setup; with no account waiting it goes in a connector. */
function lineFor(shape: SecretShape, where: SecretHoldWhere): string {
  const onComputer = where.phone === true ? " on your computer" : "";
  if (shape === "google-client-secret" && where.place === "connectors") {
    return `This looks like a Google client secret. ${keptInRunLog} Add the secret to a connector in the Library${onComputer} instead.`;
  }
  if (shape === "google-client-secret") {
    return `This looks like a Google client secret. ${keptInRunLog} Put it in the secret field of the Google setup${onComputer} instead.`;
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
