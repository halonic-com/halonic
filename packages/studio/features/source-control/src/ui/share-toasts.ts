import type { ToastStore } from "@halonicjs/studio-kit";
import type { ChangesList } from "../changes-list.ts";
import { shareWords } from "../changes-words.ts";

/** What the toasts of one share say: the title when it worked, and the line after a reason. */
export interface ShareToastWords {
  /** "Shared 3 versions", or "Created and shared version "First reply flow"". */
  readonly shared: (sent: number) => string;
  /** The line under `shared`, when it has one: the version, under "Weekly report is live.". */
  readonly sharedText?: (sent: number) => string;
  /** "Nothing was sent.", or "Your version is saved here." after Create version. */
  readonly afterReason: string;
}

/** The words of Share on the sharing strip, and of Try again after any share. */
export const shareStripWords: ShareToastWords = {
  shared: shareWords.shared,
  afterReason: shareWords.nothingSent,
};

/**
 * Shares the versions the shared copy lacks and says how it went in a toast (checklist part 2,
 * 2.3 and 2.6). A failure's toast stays until closed and has Try again, which shares once more
 * and speaks as the sharing strip does. A press while a share runs is dropped without a word.
 */
export async function shareAndSay(
  list: ChangesList,
  toasts: ToastStore | null,
  words: ShareToastWords = shareStripWords,
): Promise<void> {
  const outcome = await list.share();
  if (outcome === undefined) return;
  if ("sent" in outcome) {
    const text = words.sharedText?.(outcome.sent);
    toasts?.show({
      tone: "success",
      title: words.shared(outcome.sent),
      ...(text === undefined ? {} : { text }),
    });
    return;
  }
  toasts?.show({
    tone: "danger",
    title: shareWords.shareFailed,
    text: `${outcome.failed} ${words.afterReason}`,
    action: { label: shareWords.tryAgain, onClick: () => void shareAndSay(list, toasts) },
    sticky: true,
  });
}
