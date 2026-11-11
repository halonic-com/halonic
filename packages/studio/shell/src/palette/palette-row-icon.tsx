import { PlaceIcon } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { isSidebarPlace } from "../points/frame.ts";
import type { PaletteRow } from "./palette-groups.ts";

/**
 * The icon at the start of a palette row (`shell.palette-dialog`): a place shows the outline icon
 * the sidebar draws for it, so Inbox looks the same in both. Other rows have none yet.
 */
export function paletteRowIcon(row: PaletteRow): ReactNode {
  if (row.target.kind !== "location" || !isSidebarPlace(row.target.location.key)) {
    return null;
  }
  return <PlaceIcon name={row.target.location.key} />;
}
