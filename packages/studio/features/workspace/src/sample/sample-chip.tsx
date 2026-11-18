import { HeaderBadge, HeaderBadgeSheet, type MenuItem } from "@halonicjs/studio-kit";
import { useState, useSyncExternalStore } from "react";
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

/** Props for {@link PhoneSampleChip}. */
export interface PhoneSampleChipProps {
  /** Opens the sample sheet, which the shell's More page shows under the workspace row. */
  readonly onOpenSheet: () => void;
}

/**
 * The sample chip on a phone, on More's own line under the workspace row. It opens the
 * {@link SampleSheet}, not a menu: a phone never starts a workspace or makes a fresh copy.
 */
export function PhoneSampleChip({ onOpenSheet }: PhoneSampleChipProps) {
  return (
    <HeaderBadge
      as="menu"
      description={sampleChipWords.cost}
      entries={[]}
      onOpenSheet={onOpenSheet}
    >
      {sampleChipWords.chip}
    </HeaderBadge>
  );
}

/**
 * The header chip "Sample · test model" of a workspace created as the Acme sample
 * (`workspace.try-sample`). It is a menu button with the cost line, **New workspace…** and
 * **Fresh copy of the sample**. While the workspace isn't trusted yet the trust badge has the
 * slot and the chip stays away. In a desktop window as narrow as a phone the chip sits on More and
 * opens the same rows as a sheet, since the computer can write folders there.
 *
 * @example
 * <SampleChip trust={opened.trust} onNewWorkspace={askNewWorkspace} onFreshCopy={freshCopy} />
 */
export function SampleChip({ trust, onNewWorkspace, onFreshCopy }: SampleChipProps) {
  const status = useSyncExternalStore(
    (onChange) => trust?.subscribe(onChange) ?? (() => {}),
    () => trust?.status,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  if (trust !== undefined && status !== "trusted") {
    return null;
  }
  const entries: readonly MenuItem[] = [
    ...(onNewWorkspace === undefined
      ? []
      : [{ id: "new-workspace", label: NEW_WORKSPACE_MENU_ROW, onSelect: onNewWorkspace }]),
    { id: "fresh-copy", label: sampleChipWords.freshCopy, onSelect: onFreshCopy },
  ];
  return (
    <>
      <HeaderBadge
        as="menu"
        description={sampleChipWords.cost}
        entries={entries}
        onOpenSheet={() => setSheetOpen(true)}
      >
        {sampleChipWords.chip}
      </HeaderBadge>
      {sheetOpen ? (
        <div className="fixed inset-0 z-40 bg-surface">
          <HeaderBadgeSheet
            title={sampleChipWords.chip}
            description={sampleChipWords.cost}
            entries={entries.map((entry) => ({
              ...entry,
              onSelect: () => {
                setSheetOpen(false);
                entry.onSelect();
              },
            }))}
            onClose={() => setSheetOpen(false)}
          />
        </div>
      ) : null}
    </>
  );
}
