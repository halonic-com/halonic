import { findSecretShape, type SecretShape } from "@halonicjs/std";

/** Why a message is held, and what the line under the box says about it. */
export interface SecretHold {
  readonly shape: SecretShape;
  /** The sentence under the box. It names the kind, never the text that matched. */
  readonly line: string;
}

/** A chat message held because it looks like it holds a secret (H29). */
export interface ChatSecretHold extends SecretHold {
  /**
   * Whether **Go to the key field ›** leads where the secret belongs. It opens Models, so not for
   * a Google client secret, whose field is in the Google setup (google-setup-flow 4.2).
   */
  readonly keyField: boolean;
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
 * The line under a chat's box (H29, flow-assistant 5.9). A chat doesn't know whether a Google
 * account waits for its setup, so a Google client secret's line names both places it can go.
 */
function chatLineFor(shape: SecretShape): string {
  if (shape === "google-client-secret") {
    return "This looks like a Google client secret. It goes in the Google setup or in a connector in the Library, so it stays out of chats and files.";
  }
  return "This looks like an API key. Keys go in the key field, so they stay out of chats and files.";
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

/**
 * Whether a chat message looks like it holds a secret, so the Assistant and Try it keep it in the
 * box instead of sending it to the model and keeping it in the chat. Like {@link secretHold}, the
 * answer carries no part of the text.
 *
 * @example
 * chatSecretHold("my key starts with sk-abc"); // undefined
 */
export function chatSecretHold(text: string): ChatSecretHold | undefined {
  const shape = findSecretShape(text);
  if (shape === undefined) return undefined;
  return { shape, line: chatLineFor(shape), keyField: shape !== "google-client-secret" };
}
