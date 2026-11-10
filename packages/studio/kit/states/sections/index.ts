import type { PartSection } from "../state-table.tsx";
import { actionBarSection } from "./action-bar.tsx";
import { buttonSection } from "./button.tsx";
import { cardSection } from "./card.tsx";
import { checkboxSection } from "./checkbox.tsx";
import { commandBoxSection } from "./command-box.tsx";
import { copyButtonSection } from "./copy-button.tsx";
import { disclosureSection } from "./disclosure.tsx";
import { externalLinkSection } from "./external-link.tsx";
import { fieldSection } from "./field.tsx";
import { filterChipsSection } from "./filter-chips.tsx";
import { formRowsSection } from "./form-rows.tsx";
import { iconTileSection } from "./icon-tile.tsx";
import { inputLeadingSection } from "./input-leading.tsx";
import { kbdSection } from "./kbd.tsx";
import { lineFrameSection } from "./line-frame.tsx";
import { listSection } from "./list.tsx";
import { menuSection } from "./menu.tsx";
import { radioSection } from "./radio.tsx";
import { selectSection } from "./select.tsx";
import { sliderSection } from "./slider.tsx";
import { statusChipSection } from "./status-chip.tsx";
import { switchSection } from "./switch.tsx";
import { tabsSection } from "./tabs.tsx";
import { tooltipSection } from "./tooltip.tsx";
import { viewOnlyLineSection } from "./view-only-line.tsx";
import { windowSection } from "./window.tsx";

/**
 * Every part on main, in spec order, which is also the states sheet's order. A part gets its
 * section when it lands on main.
 */
export const SECTIONS: readonly PartSection[] = [
  buttonSection,
  fieldSection,
  inputLeadingSection,
  selectSection,
  tabsSection,
  listSection,
  cardSection,
  statusChipSection,
  checkboxSection,
  switchSection,
  kbdSection,
  disclosureSection,
  viewOnlyLineSection,
  lineFrameSection,
  actionBarSection,
  menuSection,
  tooltipSection,
  filterChipsSection,
  commandBoxSection,
  sliderSection,
  formRowsSection,
  radioSection,
  copyButtonSection,
  externalLinkSection,
  windowSection,
  iconTileSection,
];
