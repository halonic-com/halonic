import { DashedRingIcon, LineFrame, useToastStore } from "@halonicjs/studio-kit";
import type { ChangesList } from "../changes-list.ts";
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

/**
 * The strip for versions the shared copy lacks (2.3): "1 version isn't shared yet" with
 * Share 1 version. While it runs the strip says "Sharing…" with no action, and keeps its place.
 * The result is a toast; a failure's has Try again and says nothing was sent.
 */
export function NotSharedStrip({ list }: { readonly list: ChangesList }) {
  const toasts = useToastStore();
  const { unshared, sharing } = list.state;
  const share = async (): Promise<void> => {
    const outcome = await list.share();
    if ("sent" in outcome) {
      toasts?.show({ tone: "success", title: shareWords.shared(outcome.sent) });
      return;
    }
    toasts?.show({
      tone: "danger",
      title: shareWords.shareFailed,
      text: `${outcome.failed} ${shareWords.nothingSent}`,
      action: { label: shareWords.tryAgain, onClick: () => void share() },
    });
  };
  if (sharing) {
    return (
      <LineFrame muted icon={<DashedRingIcon />}>
        {shareWords.sharing}
      </LineFrame>
    );
  }
  return (
    <LineFrame
      muted
      icon={<DashedRingIcon />}
      action={{ label: shareWords.share(unshared), onClick: () => void share() }}
    >
      {shareWords.notShared(unshared)}
    </LineFrame>
  );
}
