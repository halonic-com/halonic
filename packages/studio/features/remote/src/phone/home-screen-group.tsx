import { Button } from "@halonicjs/studio-kit";
import { useEffect, useId, useState } from "react";
import type { ShortcutTab } from "./app/shortcut-landing.ts";
import { shortcutWords } from "./shortcut-words.ts";

/** Pinning a screen to the phone's home screen, through the Android app's shell. */
export interface PhonePinning {
  /** Whether the launcher pins shortcuts; false when the shell can't tell. */
  readonly canPin: () => Promise<boolean>;
  /** Opens Android's own Add to Home screen for `screen`. */
  readonly pin: (screen: ShortcutTab) => void;
}

const pinnable: readonly ShortcutTab[] = ["inbox", "messenger"];

/**
 * The Home screen group (HAL-18991, on Paired computers per HAL-19149): one row per screen, each
 * with Add, which opens Android's own dialog. Paired computers shows it only once `useCanPin` says
 * the launcher pins, so no Add ever does nothing. It is the screen's last block: the list's 24px
 * above it, and `pb-safe` below to clear the home bar (HAL-20219).
 */
export function HomeScreenGroup({ pinning }: { readonly pinning: PhonePinning }) {
  const heading = useId();
  return (
    <section aria-labelledby={heading} className="flex flex-col gap-2 px-6 pt-6 pb-safe">
      <h2 id={heading} className="text-body-strong text-fg">
        {shortcutWords.homeScreen}
      </h2>
      <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border p-0">
        {pinnable.map((screen) => (
          <li key={screen} className="flex items-center gap-4 px-4 py-3">
            <span className="min-w-0 flex-1 text-fg">{shortcutWords.screen[screen]}</span>
            <Button
              variant="secondary"
              size="touch"
              name={shortcutWords.addName(shortcutWords.screen[screen])}
              onClick={() => pinning.pin(screen)}
            >
              {shortcutWords.add}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The launcher's answer to whether it pins; false until it answers, without the shell, and when
 * the question fails, which goes to `report` (Liam, #6689).
 */
export function useCanPin(
  pinning: PhonePinning | undefined,
  report: ((problem: string) => void) | undefined,
): boolean {
  const [canPin, setCanPin] = useState(false);
  useEffect(() => {
    if (pinning === undefined) return;
    let showing = true;
    pinning.canPin().then(
      (answer) => {
        if (showing) setCanPin(answer);
      },
      (error: unknown) => {
        if (showing) setCanPin(false);
        report?.(`Whether the launcher pins couldn't be read: ${String(error)}`);
      },
    );
    return () => {
      showing = false;
    };
  }, [pinning, report]);
  return canPin;
}
