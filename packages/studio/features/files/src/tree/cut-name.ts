const ellipsis = "…";

/**
 * Cuts a long file name in the middle so the start and the ending stay readable
 * (`very-long-agent-na….agent.yaml`). A name that fits is returned as it is.
 *
 * @param name - the file or folder name
 * @param limit - the most characters to show, ellipsis included
 */
export function cutInMiddle(name: string, limit: number): string {
  if (name.length <= limit) return name;
  if (limit <= ellipsis.length) return ellipsis.slice(0, Math.max(limit, 0));
  const room = limit - ellipsis.length;
  const tail = Math.ceil(room / 2);
  const head = room - tail;
  return `${name.slice(0, head)}${ellipsis}${name.slice(name.length - tail)}`;
}

/**
 * Cuts a long file name in the middle to the most characters whose drawn width fits in `width`,
 * so the start and the ending stay in sight in a font of any kind. A name that fits is returned as
 * it is.
 *
 * Each extra character adds one letter to the cut, so its width only grows: the longest cut that
 * fits is found by halving.
 *
 * @param name - the file or folder name
 * @param width - the room the name has, in pixels
 * @param widthOf - the drawn width of a text, in pixels
 */
export function cutToWidth(name: string, width: number, widthOf: (text: string) => number): string {
  if (widthOf(name) <= width) return name;
  let fits = 0;
  let tooLong = name.length;
  while (tooLong - fits > 1) {
    const limit = Math.floor((fits + tooLong) / 2);
    if (widthOf(cutInMiddle(name, limit)) <= width) fits = limit;
    else tooLong = limit;
  }
  return cutInMiddle(name, fits);
}
