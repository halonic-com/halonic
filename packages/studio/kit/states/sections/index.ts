import type { PartSection } from "../state-table.tsx";
import { buttonSection } from "./button.tsx";
import { cardSection } from "./card.tsx";
import { checkboxSection } from "./checkbox.tsx";
import { copyButtonSection } from "./copy-button.tsx";
import { externalLinkSection } from "./external-link.tsx";
import { fieldSection } from "./field.tsx";
import { iconTileSection } from "./icon-tile.tsx";
import { kbdSection } from "./kbd.tsx";
import { listSection } from "./list.tsx";
import { statusChipSection } from "./status-chip.tsx";
import { tabsSection } from "./tabs.tsx";
import { windowSection } from "./window.tsx";

/**
 * Every part on main, in spec order, which is also the states sheet's order. A part gets its
 * section when it lands on main.
 */
export const SECTIONS: readonly PartSection[] = [
  buttonSection,
  fieldSection,
  tabsSection,
  listSection,
  cardSection,
  statusChipSection,
  checkboxSection,
  kbdSection,
  copyButtonSection,
  externalLinkSection,
  windowSection,
  iconTileSection,
];
