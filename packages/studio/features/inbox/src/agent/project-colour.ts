/**
 * The three project dot colours, the theme's own series hues spelled out whole so the Studio's CSS
 * build finds each class. None is the violet of "your turn", the amber of late, the azure of a
 * running agent, which on an agent's row would read as "working" (HAL-20307), the rose of
 * `series-2`, which is the Studio's "failed" and would read as an alarm (HAL-20370), or the blue of
 * `series-1`, which is the row's unread dot (HAL-20395); the name beside the dot tells two close
 * hues apart, as a chart's line ends do.
 */
const colours = ["bg-series-3", "bg-series-4", "bg-series-other"] as const;

/** One of the three project dot colours, as a background class. */
export type ProjectColour = (typeof colours)[number];

/**
 * A project's dot colour (`inbox.project-dot`), picked from its ID alone: projects have no colour
 * of their own, and the same ID gives the same colour in every list and across restarts.
 *
 * @example
 * <span className={`size-2 rounded-full ${projectColour(project.id)}`} />
 */
export function projectColour(id: string): ProjectColour {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  return colours[hash % colours.length] ?? colours[0];
}
