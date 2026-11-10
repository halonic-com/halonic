import { keyShortcutsLabel } from "../../src/kbd/kbd.tsx";
import { dividerClasses, type MenuEntry, menuClasses } from "../../src/menu/menu.tsx";
import { MenuRow } from "../../src/menu/menu-row.tsx";
import { FlowIcon } from "../icons.tsx";
import type { PartSection } from "../state-table.tsx";

const nothing = () => undefined;

const open = {
  id: "open",
  label: "Open",
  icon: <FlowIcon />,
  keys: ["Ctrl", "O"],
  onSelect: nothing,
} as const;
const rename = { id: "rename", label: "Rename…", onSelect: nothing } as const;

/**
 * A static copy of an open Menu: the real panel and items, drawn inline instead of in the top
 * layer, so every state shows at once. The active item is the one with `activeId`; its row forces
 * focus on it, which is what gives it the fill.
 */
function StaticMenu({
  entries,
  activeId,
}: {
  readonly entries: readonly MenuEntry[];
  readonly activeId?: string;
}) {
  return (
    <div role="menu" aria-label="Static copy of a menu" className={`${menuClasses} w-56`}>
      {entries.map((entry, position) =>
        entry === "divider" ? (
          <hr key={`divider-${position}`} className={dividerClasses} />
        ) : (
          <MenuRow
            key={entry.id}
            item={entry}
            active={entry.id === activeId}
            keyShortcuts={entry.keys === undefined ? undefined : keyShortcutsLabel(entry.keys)}
            onFocus={nothing}
            onBlur={nothing}
            onPick={nothing}
          />
        ),
      )}
    </div>
  );
}

export const menuSection: PartSection = {
  id: "menu",
  number: "14",
  name: "Menu",
  order: "kit 14 · an open menu, drawn inline; the row's state is on the item it names",
  notApplicable:
    "focus ring (the fill is the only sign), error (an action that fails reports through a toast)",
  rows: [
    { name: "Default", copies: () => <StaticMenu entries={[open, rename]} /> },
    {
      name: "Active",
      force: "focus",
      target: '[data-fill="muted"]',
      copies: () => <StaticMenu entries={[open, rename]} activeId="open" />,
    },
    {
      name: "Disabled",
      copies: () => (
        <StaticMenu
          entries={[rename, { id: "copy", label: "Copy path", disabled: true, onSelect: nothing }]}
        />
      ),
    },
    {
      name: "Unavailable",
      copies: () => (
        <StaticMenu
          entries={[
            rename,
            {
              id: "run",
              label: "Run now",
              unavailable: { reason: "Finish getting updates first." },
              onSelect: nothing,
            },
          ]}
        />
      ),
    },
    {
      name: "Danger",
      copies: () => (
        <StaticMenu
          entries={[
            rename,
            "divider",
            { id: "delete", label: "Delete agent", danger: true, onSelect: nothing },
          ]}
        />
      ),
    },
  ],
};
