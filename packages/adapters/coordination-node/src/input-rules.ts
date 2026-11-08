// The port's input rules, the same on every adapter. Each check throws a
// RangeError before anything is read or changed, so a refused call changes nothing.

const maxKeyBytes = 256;
const maxValueBytes = 64 * 1024;

/** The number of UTF-8 bytes in `text`. */
export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/**
 * @throws RangeError when the key isn't 1 to 256 UTF-8 bytes
 */
export function checkKey(key: string): void {
  const bytes = utf8Bytes(key);
  if (bytes < 1 || bytes > maxKeyBytes) {
    throw new RangeError(`A coordination key is 1 to ${maxKeyBytes} UTF-8 bytes, not ${bytes}.`);
  }
}

/**
 * @throws RangeError when the value is longer than 64 KiB of UTF-8
 */
export function checkValue(value: string | null): void {
  if (value !== null && utf8Bytes(value) > maxValueBytes) {
    throw new RangeError(`A coordination value is at most ${maxValueBytes} UTF-8 bytes.`);
  }
}

/**
 * @throws RangeError when `amount` isn't a positive safe whole number
 */
export function checkAmount(name: string, amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RangeError(`${name} must be a positive safe whole number, not ${amount}.`);
  }
}
