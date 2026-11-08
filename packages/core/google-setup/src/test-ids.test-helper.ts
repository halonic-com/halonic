import { fixedClock, type IdGenerator, randomIds } from "@halonicjs/std";

/**
 * Ids for tests in the real `randomIds` shape, which the store names insist
 * on: the fixed clock's start time and a counter as the random part, so the
 * first client ref is `gclient_mjuohs00_00000001`.
 */
export function testIds(): IdGenerator {
  let count = 0;
  const countingBytes = (byteCount: number): Uint8Array => {
    count += 1;
    const bytes = new Uint8Array(byteCount);
    new DataView(bytes.buffer).setUint32(byteCount - 4, count);
    return bytes;
  };
  return randomIds(countingBytes, fixedClock(undefined, 0));
}

/** A well-formed client ref that no test saves anything under. */
export const unsavedClientRef = "gclient_mjuohs00_ffffffff";
