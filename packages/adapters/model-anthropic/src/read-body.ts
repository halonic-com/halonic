// The same file is in model-openai. Like call-error.ts, it is a candidate for
// the shared http-kit in the plan's adapters table.

/** The error {@link readTextWithin} fails with when a body is larger than its limit. */
export class BodyTooLargeError extends Error {
  override readonly name = "BodyTooLargeError";
  /** The limit the body went over, in bytes. */
  readonly maxBytes: number;

  /** @param maxBytes - the limit the body went over */
  constructor(maxBytes: number) {
    super(`the body is larger than ${maxBytes} bytes`);
    this.maxBytes = maxBytes;
  }
}

/**
 * Reads the body of `response` as UTF-8 text, the way `response.text()`
 * does, but never more than `maxBytes` of it. A body that declares a larger
 * length is refused before any of it is read; one that grows past the limit
 * stops at the first piece over it, and the rest is cancelled.
 *
 * @throws {BodyTooLargeError} when the body is larger than `maxBytes`
 * @throws whatever reading the body throws, such as the reason of an aborted signal
 */
export async function readTextWithin(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? Number.NaN);
  if (declared > maxBytes) {
    await response.body?.cancel();
    throw new BodyTooLargeError(maxBytes);
  }
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let seen = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    seen += value.byteLength;
    if (seen > maxBytes) {
      await reader.cancel();
      throw new BodyTooLargeError(maxBytes);
    }
    text += decoder.decode(value, { stream: true });
  }
}
