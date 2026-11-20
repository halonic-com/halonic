// The command palette part of the public API of @halonicjs/studio-shell,
// re-exported by `index.ts` to keep that file under the size limit.
export { CommandPalette, type CommandPaletteProps } from "./palette/command-palette.tsx";
export {
  compareNameMatches,
  findWords,
  matchName,
  type NameMatch,
  type NameMatchRank,
  nameMatchRanks,
  type WordsFound,
  type WordsOptions,
} from "./palette/name-match.ts";
export {
  itemLocationKey,
  type PaletteContent,
  type PaletteGroup,
  type PaletteGroupId,
  type PaletteRow,
  type PaletteSources,
  type PaletteTarget,
  paletteGroupRows,
  paletteGroups,
  paletteGroupTitles,
} from "./palette/palette-groups.ts";
export { type PaletteOpening, usePaletteOpening } from "./palette/palette-opening.ts";
export {
  type ActiveRowChange,
  keptActive,
  movedActive,
  type PaletteKey,
  type PaletteKindNames,
  paletteKeyFor,
  paletteOptionName,
  paletteOptions,
  resultCountDelayMs,
  resultCountText,
} from "./palette/palette-options.ts";
export {
  PhoneSearchSheet,
  type PhoneSearchSheetProps,
} from "./palette/phone-search-sheet.tsx";
export { RecentPlaces, recentPlacesKept } from "./palette/recent-places.ts";
export { type FoundItems, searchProviders } from "./palette/search-providers.ts";
export {
  ShellPalette,
  type ShellPaletteProps,
  usePaletteKey,
} from "./palette/shell-palette.tsx";
export {
  ShellPhoneSearch,
  type ShellPhoneSearchProps,
} from "./palette/shell-phone-search.tsx";
export { type PaletteSearch, usePaletteSearch } from "./palette/use-palette-search.ts";
