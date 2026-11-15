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
