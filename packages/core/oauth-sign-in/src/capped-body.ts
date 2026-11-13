import { decodeUtf8 } from "@halonicjs/std";

/**
 * The text of a response body, or `undefined` when the body is longer than
 * `maxBytes`. It reads the body piece by piece and stops, and cancels the
 * rest, at the first piece that goes past the limit, so a huge answer is
 * never held whole. A declared `content-length` over the limit is refused
 * before any byte is read.
 *
 * @param response - the response whose body to read
 * @param maxBytes - the most bytes to accept
 * @returns the body as UTF-8 text, or `undefined` for a body over the limit
 */
export async function readCappedText(
  response: Response,
  maxBytes: number,
): Promise<string | undefined> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > maxBytes) {
    await response.body?.cancel();
    return undefined;
  }
  if (response.body === null) {
    return "";
  }
  const reader = response.body.getReader();
  const pieces: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const piece = await reader.read();
    if (piece.done) {
      break;
    }
    total += piece.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    pieces.push(piece.value);
  }
  const whole = new Uint8Array(total);
  let offset = 0;
  for (const piece of pieces) {
    whole.set(piece, offset);
    offset += piece.byteLength;
  }
  return decodeUtf8(whole);
}
