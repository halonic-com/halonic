const notPlainText =
  "a listed tool's text is untrusted: render `.text` inside the untrusted fence instead of turning it into a string or JSON";

/**
 * A text from a tool listing, which a server the workspace chose wrote: the
 * tool's description, or a `description` or `title` in its parameters. It
 * reaches the model only inside the untrusted fence, which tool assembly
 * renders (requirement `ports.untrusted-tool-listings`).
 *
 * It is an object and not a string, so it can't end up in a prompt by
 * accident: turning it into a string, or the parameters that hold it into
 * JSON, throws.
 *
 * @example
 * const fenced = renderFence(description.text);
 */
export class UntrustedText {
  /** The text as the server sent it. Read it only to put it inside the fence. */
  readonly text: string;

  /** @param text - the text as the server sent it */
  constructor(text: string) {
    this.text = text;
  }

  /** @throws always, because the text must go through the fence */
  toString(): string {
    throw new Error(notPlainText);
  }

  /** @throws always, because the text must go through the fence */
  toJSON(): never {
    throw new Error(notPlainText);
  }
}
