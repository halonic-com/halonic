import { HeaderBadgeSheet } from "@halonicjs/studio-kit";
import { sampleChipWords, sampleSheetWords } from "./sample-text.ts";

/** Props for {@link SampleSheet}. */
export interface SampleSheetProps {
  readonly onClose: () => void;
}

/**
 * What the sample chip's menu is on a phone (`workspace.try-sample`, flow-first-run 7.2): the
 * kit's panel sheet titled "Sample answers", with the cost line and one sentence, instead
 * of the desktop's New workspace and Fresh copy, which both write folders on the computer. It
 * covers the window, as a page on the phone's stack does.
 *
 * @example
 * <SampleSheet onClose={() => setOpen(false)} />
 */
export function SampleSheet({ onClose }: SampleSheetProps) {
  return (
    <div className="fixed inset-0 z-40 bg-surface">
      <HeaderBadgeSheet
        title={sampleChipWords.chip}
        description={sampleChipWords.cost}
        note={sampleSheetWords.ownWorkspace}
        entries={[]}
        onClose={onClose}
      />
    </div>
  );
}
