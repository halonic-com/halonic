/**
 * The four frame colour presets and their two colours, `--halo-blue` first and `--halo-violet`
 * second, in the order Settings lists them (visual language, HAL-6655). The first is the theme's
 * own halo, the default. Settings and the halo's contrast test both read this one list.
 */
export const haloPresets = {
  "blue-and-purple": ["#3B8BFF", "#B05ED9"],
  "green-and-blue": ["#10B981", "#3B8BFF"],
  "yellow-and-orange": ["#FBBF24", "#F97316"],
  "pink-and-violet": ["#EC4899", "#8B5CF6"],
} as const satisfies Readonly<Record<string, readonly [blue: string, violet: string]>>;

/** One of the frame colour presets, such as `blue-and-purple`. */
export type HaloPreset = keyof typeof haloPresets;
