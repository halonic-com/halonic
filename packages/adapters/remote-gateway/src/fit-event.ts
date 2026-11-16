import { type GatewayHostMessage, gatewayMaxMessageBytes } from "@halonicjs/ports";

const encoder = new TextEncoder();
const ellipsis = "…";

/**
 * The JSON of an `event` message that fits in one message, or `undefined`
 * when it can't be made to fit. A `message` text that makes it too large is
 * shortened and ends with "…"; the full text stays on the desktop.
 */
export function fitEvent(
  message: Extract<GatewayHostMessage, { type: "event" }>,
): string | undefined {
  const whole = JSON.stringify(message);
  if (sizeOf(whole) <= gatewayMaxMessageBytes) return whole;
  const { body } = message;
  if (body.type !== "message") return undefined;
  const withText = (text: string) => JSON.stringify({ ...message, body: { ...body, text } });
  // The longest text prefix that fits, by bisection: the size grows with the length.
  let fits = 0;
  let tooLong = body.text.length;
  while (tooLong - fits > 1) {
    const middle = Math.floor((fits + tooLong) / 2);
    if (sizeOf(withText(cut(body.text, middle) + ellipsis)) <= gatewayMaxMessageBytes)
      fits = middle;
    else tooLong = middle;
  }
  const shortened = withText(cut(body.text, fits) + ellipsis);
  return sizeOf(shortened) <= gatewayMaxMessageBytes ? shortened : undefined;
}

/** The first `length` code units of `text`, without a surrogate pair cut in two. */
function cut(text: string, length: number): string {
  const end = length > 0 && isHighSurrogate(text.charCodeAt(length - 1)) ? length - 1 : length;
  return text.slice(0, end);
}

function isHighSurrogate(unit: number): boolean {
  return unit >= 0xd800 && unit <= 0xdbff;
}

function sizeOf(json: string): number {
  return encoder.encode(json).byteLength;
}
