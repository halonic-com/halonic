import { Kbd, keyShortcutsLabel, SearchIcon } from "@halonicjs/studio-kit";
import { hintKeys } from "../points/key-hints.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";

/** Props for {@link SidebarSearch}. */
export interface SidebarSearchProps {
  /** Decides whether the hint reads Ctrl K or ⌘ K. */
  readonly platform: KeyboardPlatform;
  /** Opens the Ctrl K palette: `palette.show` from `usePaletteOpening`. */
  readonly onOpen: () => void;
}

/**
 * The sidebar's Search box, right under the workspace switcher (component specs 24.4, UX 1.3): a
 * button that looks like a field, with the search icon, "Search" and the Kbd Mod K at its right.
 * It opens the Ctrl K palette, and names its keys in `aria-keyshortcuts`. Mod K is bound in the
 * desktop app and served alike, so the hint shows in both.
 *
 * @example
 * <SidebarSearch platform={platform} onOpen={palette.show} />
 */
export function SidebarSearch({ platform, onOpen }: SidebarSearchProps) {
  const keys = hintKeys("Mod+K", platform);
  return (
    <button
      type="button"
      aria-keyshortcuts={keyShortcutsLabel(keys)}
      className={searchClasses}
      onClick={onOpen}
    >
      <span aria-hidden="true" className="size-icon-sm shrink-0 *:size-full">
        <SearchIcon />
      </span>
      <span className="min-w-0 flex-1 truncate text-start">Search</span>
      <Kbd keys={keys} />
    </button>
  );
}

// 32px, `surface` with a 1px border, radius 8px, padding 0 10px (component specs 24.4). Hover
// darkens the edge as the kit Input's does, since it looks like a field.
const searchClasses = [
  "flex h-8 w-full min-w-0 items-center gap-2 rounded-sm border border-border bg-surface px-2.5",
  "text-small text-fg-subtle outline-none focus-ring hover:border-fg-muted",
].join(" ");
