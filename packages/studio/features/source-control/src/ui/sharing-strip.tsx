import { DashedRingIcon, LineFrame } from "@halonicjs/studio-kit";
import { phoneWords, shareWords } from "../changes-words.ts";

/**
 * The sharing strip's one state so far (checklist part 2, 2.3): a folder with no share address
 * says "Only on this computer" and offers Add where to share. The strip is a plain line with no
 * fill; the other states come with sharing itself.
 */
export function SharingStrip({
  onAdd,
  phone = false,
}: {
  readonly onAdd: () => void;
  /** On a phone the address is view-only: "Only on your computer." with a hint, and no action. */
  readonly phone?: boolean;
}) {
  if (phone) {
    return (
      <LineFrame muted icon={<DashedRingIcon />}>
        {phoneWords.onlyHere}
        <span className="block">{phoneWords.addOnComputer}</span>
      </LineFrame>
    );
  }
  return (
    <LineFrame
      muted
      icon={<DashedRingIcon />}
      action={{ label: shareWords.addWhereToShare, onClick: onAdd }}
    >
      {shareWords.onlyHere}
    </LineFrame>
  );
}
