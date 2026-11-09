import { IconTile } from "../../src/icon-tile/icon-tile.tsx";
import { FlowIcon, ListIcon, SlidersIcon } from "../icons.tsx";
import type { PartSection } from "../state-table.tsx";

export const iconTileSection: PartSection = {
  id: "icon-tile",
  number: "theme",
  name: "IconTile",
  order: "site theme (HAL-1687) · left to right: flow, list, sliders",
  notApplicable: "hover, focus, disabled (decoration, not interactive)",
  rows: [
    {
      name: "Default",
      copies: () => (
        <>
          <IconTile>
            <FlowIcon />
          </IconTile>
          <IconTile>
            <ListIcon />
          </IconTile>
          <IconTile>
            <SlidersIcon />
          </IconTile>
        </>
      ),
    },
  ],
};
