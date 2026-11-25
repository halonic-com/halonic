import { PlaceIcon } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { isSidebarPlace } from "../points/frame.ts";
import type { PaletteRow } from "./palette-groups.ts";

/**
 * The icon at the start of a palette row (`shell.palette-dialog`): a place shows the outline icon
 * the sidebar draws for it, so Inbox looks the same in both. Other rows have none yet, also a
 * found item that opens a place, such as a Paperclip task that opens Overview.
 */
export function paletteRowIcon(row: PaletteRow): ReactNode {
  const location = row.target.kind === "location" ? row.target.location : undefined;
  if (location === undefined || row.key !== location.key || !isSidebarPlace(location.key)) {
    return null;
  }
  return <PlaceIcon name={location.key} />;
}
