import { HeaderBadge, type MenuEntry } from "@halonicjs/studio-kit";
import { useSyncExternalStore } from "react";
import { NEW_WORKSPACE_MENU_ROW } from "../new-workspace/new-workspace-text.ts";
import type { WorkspaceTrustControl } from "../trust/workspace-trust-control.ts";
import { sampleChipWords } from "./sample-text.ts";

/** Props for {@link SampleChip}. */
export interface SampleChipProps {
  /** The workspace's trust; the chip gives its place to the trust badge until it is trusted. */
  readonly trust: WorkspaceTrustControl | undefined;
  /** Asks for the New workspace dialog; without it the menu has no such row. */
  readonly onNewWorkspace?: (() => void) | undefined;
  /** Writes a new copy of the sample beside this one and opens it. */
  readonly onFreshCopy: () => void;
}

/**
 * The header chip "Sample · test model" of a workspace created as the Acme sample
 * (`workspace.try-sample`). It is a menu button with the cost line, **New workspace…** and
 * **Fresh copy of the sample**. While the workspace isn't trusted yet the trust badge has the
 * slot and the chip stays away.
 *
 * @example
 * <SampleChip trust={opened.trust} onNewWorkspace={askNewWorkspace} onFreshCopy={freshCopy} />
 */
export function SampleChip({ trust, onNewWorkspace, onFreshCopy }: SampleChipProps) {
  const status = useSyncExternalStore(
    (onChange) => trust?.subscribe(onChange) ?? (() => {}),
    () => trust?.status,
  );
  if (trust !== undefined && status !== "trusted") {
    return null;
  }
  const entries: readonly MenuEntry[] = [
    ...(onNewWorkspace === undefined
      ? []
      : [{ id: "new-workspace", label: NEW_WORKSPACE_MENU_ROW, onSelect: onNewWorkspace }]),
    { id: "fresh-copy", label: sampleChipWords.freshCopy, onSelect: onFreshCopy },
  ];
  return (
    <HeaderBadge
      as="menu"
      description={sampleChipWords.cost}
      entries={entries}
      // The desktop window never presents as a phone, where this opens a sheet (PR 7).
      onOpenSheet={() => {}}
    >
      {sampleChipWords.chip}
    </HeaderBadge>
  );
}
